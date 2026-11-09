/**
 * Office store — a tiny observable state container driving the simulation and
 * the REAL AI task engine. One rAF loop advances movement; task assignment
 * walks the agent to its desk, runs the actual LLM call, then reports.
 */
import { findPath, MAP, MAP_H, MAP_W, SPOTS, spotApproach, spotById } from './sim/world';
import {
  ROLE_META, routeToSpot, workAnchor, type ActivityEvent, type Agent,
  type Task, type TaskKind,
} from './sim/agents';
import { runCompletion, taskPrompt, loadConfig, type AiConfig } from './ai/llm';

export interface OfficeState {
  agents: Agent[];
  tasks: Task[];
  feed: ActivityEvent[];
}

type Listener = () => void;

const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 9)}`;

function defaultAgent(name: string, role: Agent['role'], desk: string, persona: string): Agent {
  const spot = SPOTS.find(s => s.id === desk)!;
  return {
    id: uid('ag'), name, role, deskSpot: desk, persona,
    pos: { x: spot.x - 1, y: spot.y }, from: { x: spot.x - 1, y: spot.y }, to: { x: spot.x - 1, y: spot.y },
    facing: 1, state: 'idle', moveT: 1, walkSpeed: 2.6, path: [],
  };
}

function defaults(): OfficeState {
  return {
    agents: [
      defaultAgent('آرش', 'manager', 'desk-1', 'رویکردت: خونسرد و تصمیم‌گیر.'),
      defaultAgent('شیرین', 'writer', 'desk-2', 'رویکردت: خلاق و پرانرژی.'),
      defaultAgent('کاوه', 'researcher', 'desk-3', 'رویکردت: دقیق و کنجکاو.'),
      defaultAgent('سارا', 'assistant', 'desk-4', 'رویکردت: منظم و سریع.'),
    ],
    tasks: [],
    feed: [{ id: uid('ev'), at: Date.now(), text: 'دفتر باز شد — به ایجنت‌ها وظیفه بده!' }],
  };
}

const PERSIST_KEY = 'sesemi-office-state';
const AGENT_COLORS = ['#5e88c9', '#b8a5ea', '#5ad5b2', '#f5b56a', '#e88ca0', '#7cc7f5'];
const HAIR = ['#2b1d12', '#120e0a', '#3d2a18', '#513a22'];

export class OfficeStore {
  state: OfficeState;
  private listeners = new Set<Listener>();
  private frame = 0;
  private lastTime = 0;
  private running = false;
  private saveTimer = 0;

  constructor() {
    this.state = this.load() ?? defaults();
    // make sure every agent sits on a valid tile (map changes could strand it)
    for (const agent of this.state.agents) {
      if (MAP[agent.pos.y]?.[agent.pos.x] !== 0) {
        const spot = SPOTS.find(s => s.id === agent.deskSpot)!;
        agent.pos = { x: spot.x - 1, y: spot.y };
        agent.from = { ...agent.pos }; agent.to = { ...agent.pos };
      }
    }
    this.state.tasks.forEach(t => { if (t.status !== 'done' && t.status !== 'failed') t.status = 'failed'; });
  }

  private load(): OfficeState | null {
    try {
      const raw = localStorage.getItem(PERSIST_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as OfficeState;
      // revive agents to a clean idle state — persisted movement is meaningless
      for (const agent of parsed.agents) {
        agent.state = 'idle'; agent.path = []; agent.bubble = undefined;
        agent.taskId = undefined; agent.moveT = 1;
        agent.from = { ...agent.pos }; agent.to = { ...agent.pos };
        if (!agent.walkSpeed) agent.walkSpeed = 2.6;
      }
      return parsed;
    } catch { return null; }
  }

  persist(): void {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(PERSIST_KEY, JSON.stringify({
          agents: this.state.agents.map(a => ({ ...a, state: 'idle', path: [], bubble: undefined })),
          tasks: this.state.tasks.slice(0, 60),
          feed: this.state.feed.slice(0, 80),
        }));
      } catch { /* storage full/blocked */ }
    }, 400);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void { for (const l of this.listeners) l(); }

  /** occupied-tile set so agents don't merge into each other */
  private occupied(): Set<number> {
    const set = new Set<number>();
    for (const a of this.state.agents) {
      if (a.state === 'walking') continue;
      set.add(a.pos.y * MAP_W + a.pos.x);
    }
    return set;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = 0;
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = this.lastTime ? Math.min((now - this.lastTime) / 1000, .06) : .016;
      this.lastTime = now;
      this.tick(dt, now);
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }

  private tick(dt: number, now: number): void {
    let changed = false;
    // movement along paths
    for (const agent of this.state.agents) {
      if (agent.state !== 'walking' || !agent.path.length) continue;
      const step = agent.walkSpeed * dt;
      let remain = step;
      while (remain > 0 && agent.path.length) {
        const dist = 1 - agent.moveT;
        if (remain < dist) { agent.moveT += remain; remain = 0; }
        else {
          remain -= dist;
          agent.pos = { ...agent.to };
          agent.path.shift();
          if (agent.path.length) {
            agent.from = { ...agent.pos };
            agent.to = { ...agent.path[0] };
            agent.moveT = 0;
            agent.facing = agent.to.x > agent.from.x ? 1 : -1;
          } else { agent.moveT = 1; agent.from = { ...agent.pos }; agent.to = { ...agent.pos }; }
        }
      }
      // arrived?
      if (!agent.path.length && agent.moveT >= 1) {
        changed = true;
        const task = agent.taskId ? this.state.tasks.find(t => t.id === agent.taskId) : undefined;
        if (agent.state === 'walking' && task && task.status === 'walking') {
          agent.state = 'working';
          agent.currentSpot = agent.deskSpot;
          const spot = spotById(agent.deskSpot);
          if (spot) { const w = workAnchor(spot); agent.pos = { x: Math.round(w.x), y: w.y }; }
          task.status = 'working';
          agent.bubble = 'در حال کار…';
          this.log(`${agent.name} پشت میزش مشغول «${task.title}» شد.`);
        } else {
          agent.state = 'idle';
          agent.bubble = undefined;
        }
        this.emit();
      }
      changed = true;
    }

    // dispatch queued tasks to idle agents
    const queued = this.state.tasks.filter(t => t.status === 'queued');
    for (const task of queued) {
      const agent = this.state.agents.find(a => a.id === task.agentId && a.state === 'idle');
      if (!agent) continue;
      const occupied = this.occupied();
      const standOk = routeToSpot(agent, agent.deskSpot, occupied);
      if (!standOk) continue;
      agent.state = 'walking';
      agent.taskId = task.id;
      agent.bubble = 'رفت سر کار!';
      task.status = 'walking';
      this.log(`${agent.name} راه افتاد سمت میزش برای «${task.title}».`);
      changed = true;
    }

    // idle ambience: occasionally grab coffee or take a short stroll
    if (now - this.lastAmbience > 9000) {
      this.lastAmbience = now;
      const idleAgents = this.state.agents.filter(a => a.state === 'idle');
      if (idleAgents.length && Math.random() < .45) {
        const agent = idleAgents[Math.floor(Math.random() * idleAgents.length)];
        const roll = Math.random();
        const target = roll < .5 ? 'coffee' : roll < .8 ? 'meeting' : agent.deskSpot;
        const occupied = this.occupied();
        occupied.delete(agent.pos.y * MAP_W + agent.pos.x);
        if (routeToSpot(agent, target, occupied)) {
          agent.state = 'walking';
          agent.bubble = target === 'coffee' ? 'یه قهوه بزنم…' : target === 'meeting' ? 'می‌رم اتاق جلسه فکر کنم' : undefined;
          agent.taskId = undefined;
          const arriveState = target === 'coffee' ? 'coffee' : target === 'meeting' ? 'meeting' : 'idle';
          agent.pendingArrival = arriveState;
          changed = true;
        }
      }
    }
    // arrival without a task → ambience state
    for (const agent of this.state.agents) {
      if (agent.state === 'walking' && !agent.taskId && agent.pendingArrival && !agent.path.length && agent.moveT >= 1) {
        const target = agent.pendingArrival as Agent['state'];
        agent.state = target;
        agent.currentSpot = target === 'idle' ? undefined : (target === 'coffee' ? 'coffee' : 'meeting');
        agent.pendingArrival = undefined;
        changed = true;
        this.emit();
      }
    }
    // clear working/coffee bubbles occasionally
    for (const agent of this.state.agents) {
      if ((agent.state === 'coffee' || agent.state === 'meeting') && agent.bubble && Math.random() < dt * .25) {
        agent.bubble = undefined; changed = true;
      }
    }
    if (changed) this.emit();
  }

  private lastAmbience = 0;

  /** assign a real AI task to an agent */
  assign(agentId: string, kind: TaskKind, title: string, detail: string): Task {
    const agent = this.state.agents.find(a => a.id === agentId);
    if (!agent) throw new Error('ایجنت پیدا نشد.');
    const task: Task = {
      id: uid('tk'), agentId, kind, title: title.trim() || TASK_TITLE_FALLBACK[kind],
      detail, status: 'queued', createdAt: Date.now(),
    };
    this.state.tasks = [task, ...this.state.tasks];
    this.log(`وظیفهٔ «${task.title}» به ${agent.name} سپرده شد.`);
    this.persist();
    this.emit();
    void this.runTask(task.id);
    return task;
  }

  private runningCalls = new Set<string>();

  private async runTask(taskId: string): Promise<void> {
    const task = this.state.tasks.find(t => t.id === taskId);
    if (!task) return;
    const agent = this.state.agents.find(a => a.id === task.agentId);
    if (!agent) return;
    // wait until the agent physically reaches the desk (working state)
    const reached = await new Promise<boolean>(resolve => {
      const check = () => {
        const t2 = this.state.tasks.find(t => t.id === taskId);
        if (!t2) return resolve(false);
        if (t2.status === 'working') return resolve(true);
        if (t2.status === 'failed') return resolve(false);
        setTimeout(check, 250);
      };
      check();
    });
    if (!reached) return;
    const config: AiConfig = loadConfig();
    const meta = ROLE_META[agent.role];
    const system = `${meta.system} ${agent.persona}`;
    try {
      this.runningCalls.add(taskId);
      const result = await runCompletion(config, system, taskPrompt(task.kind, task.detail));
      task.status = 'done';
      task.result = result;
      task.finishedAt = Date.now();
      agent.bubble = 'تمام شد! ✓';
      agent.state = 'idle';
      agent.currentSpot = undefined;
      agent.taskId = undefined;
      this.log(`${agent.name} «${task.title}» را تمام کرد ✓`);
    } catch (error) {
      task.status = 'failed';
      task.result = error instanceof Error ? error.message : String(error);
      task.finishedAt = Date.now();
      agent.bubble = 'مشکل پیش آمد!';
      agent.state = 'idle';
      agent.currentSpot = undefined;
      agent.taskId = undefined;
      this.log(`${agent.name} در «${task.title}» به مشکل خورد ✗`);
    } finally {
      this.runningCalls.delete(taskId);
      this.persist();
      this.emit();
    }
  }

  private log(text: string, agentId?: string): void {
    this.state.feed = [{ id: uid('ev'), at: Date.now(), agentId, text }, ...this.state.feed].slice(0, 80);
    this.emit();
  }

  /* ---- agent management ---- */

  addAgent(name: string, role: Agent['role']): void {
    if (this.state.agents.length >= 6) return;
    const takenDesks = new Set(this.state.agents.map(a => a.deskSpot));
    const desk = SPOTS.find(s => s.id.startsWith('desk') && !takenDesks.has(s.id));
    if (!desk) return;
    const agent = defaultAgent(name || ROLE_META[role].label, role, desk.id, '');
    agent.uniformColor = AGENT_COLORS[this.state.agents.length % AGENT_COLORS.length];
    agent.hairColor = HAIR[this.state.agents.length % HAIR.length];
    this.state.agents.push(agent);
    this.log(`${agent.name} (${ROLE_META[role].label}) به تیم پیوست!`);
    this.persist();
    this.emit();
  }

  updateAgent(id: string, patch: Partial<Pick<Agent, 'name' | 'role' | 'persona' | 'uniformColor' | 'hairColor' | 'deskSpot'>>): void {
    const agent = this.state.agents.find(a => a.id === id);
    if (!agent) return;
    Object.assign(agent, patch);
    this.persist();
    this.emit();
  }

  removeAgent(id: string): void {
    const agent = this.state.agents.find(a => a.id === id);
    if (!agent) return;
    this.state.tasks.forEach(t => { if (t.agentId === id && t.status !== 'done' && t.status !== 'failed') t.status = 'failed'; });
    this.state.agents = this.state.agents.filter(a => a.id !== id);
    this.log(`${agent.name} دفتر را ترک کرد.`);
    this.persist();
    this.emit();
  }

  clearFeed(): void { this.state.feed = []; this.emit(); this.persist(); }
}

const TASK_TITLE_FALLBACK: Record<TaskKind, string> = {
  email: 'ایمیل جدید', content: 'تولید محتوا', research: 'گزارش تحقیقی', schedule: 'برنامه‌ریزی',
};

declare module './sim/agents' {
  interface Agent { uniformColor?: string; hairColor?: string; pendingArrival?: string }
}

export const store = new OfficeStore();
