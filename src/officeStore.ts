/**
 * Office store — a tiny observable state container driving the simulation and
 * the REAL AI task engine. One rAF loop advances movement; task assignment
 * walks the agent to its desk, runs the actual LLM call, then reports.
 */
import { findPath, MAP, MAP_H, MAP_W, SPOTS, spotApproach, spotById } from './sim/world';
import {
  ROLE_META, TASK_LABELS, classifyBrief, chooseDelegatee, routeToSpot, workAnchor,
  type ActivityEvent, type Agent, type DelegationResult, type Role, type Task, type TaskKind,
} from './sim/agents';
import {
  isDemoMode, loadConfig, runCompletion, runDemoCompletion, taskPrompt, type AiConfig,
} from './ai/llm';

export interface OfficeState {
  agents: Agent[];
  tasks: Task[];
  feed: ActivityEvent[];
  briefing?: Briefing;
}

/** بریفینگ مدیریتی روزانه — با کلید AI تولید می‌شود؛ بدون کلید نسخهٔ قاعده‌محور نمایشی. */
export interface Briefing {
  text: string;
  mode: 'ai' | 'rules';
  at: number;
  statsKey: string;
}

/** گزارش روزانهٔ دفتر — pure، برای رندر مستقیم پنل گزارش. */
export interface DailyReport {
  dateKey: string;          // 'YYYY-MM-DD' لوکال — فقط وظایفی که createdAtشان در امروز است
  totalDone: number;
  totalFailed: number;
  totalActive: number;      // queued + walking + working
  perAgent: { agentId: string; name: string; role: Role; done: number; failed: number; lastResult?: string }[];
  reportTasks: Task[];      // وظایف done/failed امروز، جدیدترین اول
}

function localDateKey(ts: number): string {
  const d = new Date(ts);
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
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
      // اسکیمای ناقص/قدیمی → silent-drop و defaults — وگرنه constructor روی
      // parsed.tasks تعریف‌نشده TypeError می‌گیرد و کل اپ با صفحهٔ سفید می‌میرد
      if (!Array.isArray(parsed.agents)) return null;
      if (!Array.isArray(parsed.tasks)) parsed.tasks = [];
      if (!Array.isArray(parsed.feed)) parsed.feed = [];
      // revive agents to a clean idle state — persisted movement is meaningless
      for (const agent of parsed.agents) {
        agent.state = 'idle'; agent.path = []; agent.bubble = undefined;
        agent.taskId = undefined; agent.moveT = 1;
        agent.currentSpot = undefined; agent.pendingArrival = undefined;
        agent.stateSince = undefined; agent.breakFor = undefined;
        agent.from = { ...agent.pos }; agent.to = { ...agent.pos };
        if (!agent.walkSpeed) agent.walkSpeed = 2.6;
      }
      // revive briefing فقط وقتی شکل دقیق موردانتظار را دارد — وگرنه silent-drop و
      // UI به‌سادگی دکمهٔ تولید را نشان می‌دهد
      const briefing = parsed.briefing;
      if (
        briefing &&
        typeof briefing.text === 'string' &&
        (briefing.mode === 'ai' || briefing.mode === 'rules') &&
        typeof briefing.at === 'number' &&
        typeof briefing.statsKey === 'string'
      ) {
        parsed.briefing = briefing;
      } else {
        parsed.briefing = undefined;
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
          briefing: this.state.briefing ?? undefined,
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

  /**
   * occupied + مقصدهای ایجنت‌های walking — مسیر جدید روی کاشی مقصدِ کسی که همین
   * حالا در راه است قرار نگیرد (دو ایجنت روی یک کاشی stand نمی‌ایستند).
   */
  private occupiedForRouting(): Set<number> {
    const set = this.occupied();
    for (const a of this.state.agents) {
      if (a.state !== 'walking') continue;
      const dest = a.path.length ? a.path[a.path.length - 1] : a.to;
      set.add(dest.y * MAP_W + dest.x);
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
      changed = true;
    }

    // arrival — در سطح tick (نه داخل بلوک حرکت) تا ایجنتی با مسیر خالی
    // (شاخهٔ teleportِ routeToSpot / ایستادن روی مقصد) هم برسد
    for (const agent of this.state.agents) {
      if (agent.state !== 'walking' || agent.path.length || agent.moveT < 1) continue;
      changed = true;
      const task = agent.taskId ? this.state.tasks.find(t => t.id === agent.taskId) : undefined;
      if (task && task.status === 'walking') {
        agent.state = 'working';
        agent.currentSpot = agent.deskSpot;
        const spot = spotById(agent.deskSpot);
        if (spot) { const w = workAnchor(spot); agent.pos = { x: Math.round(w.x), y: w.y }; }
        task.status = 'working';
        agent.bubble = 'در حال کار…';
        this.log(`${agent.name} پشت میزش مشغول «${task.title}» شد.`);
      } else if (agent.pendingArrival) {
        // رسیدن بدون وظیفه → حالت ambience؛ زمان‌سنج استراحت ست می‌شود تا برگشت تضمین شود
        const target = agent.pendingArrival as Agent['state'];
        agent.state = target;
        agent.currentSpot = target === 'idle' ? undefined : target;
        agent.pendingArrival = undefined;
        if (target === 'idle') {
          agent.stateSince = undefined; agent.breakFor = undefined;
        } else {
          agent.stateSince = now;
          agent.breakFor = 6000 + Math.random() * 6000;
        }
      } else {
        agent.state = 'idle';
        agent.bubble = undefined;
      }
    }

    // dispatch queued tasks to idle agents
    const queued = this.state.tasks.filter(t => t.status === 'queued');
    for (const task of queued) {
      const agent = this.state.agents.find(a => a.id === task.agentId && a.state === 'idle');
      if (!agent) continue;
      const occupied = this.occupiedForRouting();
      const standOk = routeToSpot(agent, agent.deskSpot, occupied);
      if (!standOk) continue;
      agent.state = 'walking';
      agent.taskId = task.id;
      agent.bubble = 'رفت سر کار!';
      task.status = 'walking';
      this.log(`${agent.name} راه افتاد سمت میزش برای «${task.title}».`);
      changed = true;
    }

    // استراحت coffee/meeting تمام می‌شود — ایجنت برمی‌گردد پشت میزش تا dispatchable شود
    // (بدون این، ایجنت‌ها برای همیشه در استراحت گیر می‌کنند و dispatch از کار می‌افتد)
    for (const agent of this.state.agents) {
      if ((agent.state === 'coffee' || agent.state === 'meeting') && agent.breakFor !== undefined
        && now - (agent.stateSince ?? 0) >= agent.breakFor) {
        const occupied = this.occupiedForRouting();
        occupied.delete(agent.pos.y * MAP_W + agent.pos.x);
        if (routeToSpot(agent, agent.deskSpot, occupied)) {
          agent.state = 'walking';
          agent.bubble = undefined;
          agent.taskId = undefined;
          agent.pendingArrival = 'idle';
          changed = true;
        }
      }
    }

    // idle ambience: occasionally grab coffee or take a short stroll
    if (now - this.lastAmbience > 9000) {
      this.lastAmbience = now;
      const idleAgents = this.state.agents.filter(a => a.state === 'idle');
      if (idleAgents.length && Math.random() < .45) {
        const agent = idleAgents[Math.floor(Math.random() * idleAgents.length)];
        const roll = Math.random();
        const target = roll < .5 ? 'coffee' : roll < .8 ? 'meeting' : agent.deskSpot;
        const occupied = this.occupiedForRouting();
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
    // clear working/coffee bubbles occasionally
    for (const agent of this.state.agents) {
      if ((agent.state === 'coffee' || agent.state === 'meeting') && agent.bubble && Math.random() < dt * .25) {
        agent.bubble = undefined; changed = true;
      }
    }
    // emit شبیه‌سازی را برای UI به ~10fps محدود کن — حرکتِ هر فریم نباید کل
    // درخت React را دوباره رندر کند (dirty می‌ماند تا در فریم بعدی flush شود)
    if (changed) this.dirtyUI = true;
    this.flushUI();
  }

  private lastAmbience = 0;
  private lastEmit = 0;
  private dirtyUI = false;

  private flushUI(): void {
    if (!this.dirtyUI) return;
    const now = performance.now();
    if (now - this.lastEmit >= 100) {
      this.dirtyUI = false;
      this.lastEmit = now;
      this.emit();
    }
  }

  /** assign a real AI task to an agent */
  assign(agentId: string, kind: TaskKind, title: string, detail: string): Task {
    const agent = this.state.agents.find(a => a.id === agentId);
    if (!agent) throw new Error('ایجنت پیدا نشد.');
    const task: Task = {
      id: uid('tk'), agentId, kind, title: title.trim() || TASK_TITLE_FALLBACK[kind],
      detail, status: 'queued', createdAt: Date.now(),
    };
    this.state.tasks = [task, ...this.state.tasks];
    this.trimTasks();
    this.log(`وظیفهٔ «${task.title}» به ${agent.name} سپرده شد.`);
    this.persist();
    this.emit();
    void this.runTask(task.id);
    return task;
  }

  /**
   * کار ۱ — تخصیص خودکار مدیر. بریف را مدیر قاعده‌محور توزیع می‌کند (صفر فراخوانی AI):
   * ۱) یک Task والد برای مدیر می‌سازد (isDelegation: true) — او هم مثل بقیه راه می‌افتد پشت میزش.
   * ۲) classifyBrief(detail) — برترین kind همیشه فرزند می‌گیرد؛ هر kind دیگر با
   *    score ≥ 0.5 × score برترین هم فرزند می‌گیرد (حداکثر ۲ فرزند اضافه).
   * ۳) هر فرزند با chooseDelegatee به بهترین ایجنت سپرده می‌شود؛ مدیریت کار AI نمی‌گیرد
   *    مگر هیچ ایجنت غیر-مدیرِ منطبق نباشد (chooseDelegatee خودش fallback می‌کند).
   * ۴) runTask(والد) بلافاصله فراخوانی می‌شود — والد شاخهٔ خاص خودش را دارد (بدون AI/demo).
   * خطا: throw اگر هیچ ایجنت manager وجود ندارد (پیام فارسی).
   * برگشت: { delegationId, children } — children در state.tasks با delegationId قابل فیلترند.
   */
  assignToManager(title: string, detail: string): DelegationResult {
    const manager = this.state.agents.find(a => a.role === 'manager');
    if (!manager) throw new Error('هیچ ایجنتی با نقش «مدیر» وجود ندارد — اول یک مدیر اضافه کن.');
    const ranked = classifyBrief(detail);
    const top = ranked[0];
    const childKinds: TaskKind[] = [top.kind];
    const threshold = top.score * 0.5;
    for (const entry of ranked.slice(1)) {
      if (childKinds.length >= 3) break;
      if (entry.score >= threshold) childKinds.push(entry.kind);
    }
    const delegationId = uid('tk');
    const parentTitle = title.trim() || TASK_TITLE_FALLBACK[top.kind];
    const parent: Task = {
      id: delegationId,
      agentId: manager.id,
      kind: top.kind,
      title: parentTitle,
      detail,
      status: 'queued',
      createdAt: Date.now(),
      isDelegation: true,
    };
    const children: Task[] = [];
    for (const kind of childKinds) {
      const delegatee = chooseDelegatee(kind, this.state.agents, this.state.tasks);
      if (!delegatee) continue; // فرزند برای این kind ساخته نمی‌شود
      const activeCount = this.state.tasks.filter(t => t.agentId === delegatee.id
        && (t.status === 'queued' || t.status === 'walking' || t.status === 'working')).length;
      children.push({
        id: uid('tk'),
        agentId: delegatee.id,
        kind,
        title: `${TASK_TITLE_FALLBACK[kind]} — بخشی از «${parentTitle}»`,
        detail,
        status: 'queued',
        createdAt: Date.now(),
        delegationId,
        routeReason: delegatee.role === 'manager'
          ? `هیچ ایجنتی برای «${TASK_LABELS[kind]}» نبود — ${delegatee.name} خودش می‌گیرد.`
          : `${delegatee.name} برای «${TASK_LABELS[kind]}» انتخاب شد — کمترین بار کاری (${activeCount} وظیفهٔ فعال)`,
      });
    }
    this.state.tasks = [parent, ...children, ...this.state.tasks];
    this.trimTasks();
    this.log(`${manager.name} «${parentTitle}» را بین ${children.length} وظیفه توقیع کرد.`, manager.id);
    this.persist();
    this.emit();
    void this.runTask(parent.id);
    return { delegationId, children };
  }

  /** کار ۲ — گزارش روزانه؛ pure و بدون side-effect، برای رندر مستقیم پنل. */
  getDailyReport(): DailyReport {
    const dateKey = localDateKey(Date.now());
    const todayTasks = this.state.tasks.filter(t => localDateKey(t.createdAt) === dateKey);
    const perAgent = this.state.agents.map(agent => {
      const own = todayTasks.filter(t => t.agentId === agent.id);
      const finished = own.filter(t => t.status === 'done' || t.status === 'failed'); // newest-first
      return {
        agentId: agent.id,
        name: agent.name,
        role: agent.role,
        done: own.filter(t => t.status === 'done').length,
        failed: own.filter(t => t.status === 'failed').length,
        lastResult: finished.length ? finished[0].result : undefined,
      };
    });
    return {
      dateKey,
      totalDone: todayTasks.filter(t => t.status === 'done').length,
      totalFailed: todayTasks.filter(t => t.status === 'failed').length,
      totalActive: todayTasks.filter(t => t.status === 'queued' || t.status === 'walking' || t.status === 'working').length,
      perAgent,
      reportTasks: todayTasks.filter(t => t.status === 'done' || t.status === 'failed'), // newest-first
    };
  }

  /**
   * کار ۲ — بریفینگ مدیریتی. برگشت promise؛ UI باید حالت لودینگ داشته باشد.
   * statsKey = `${dateKey}|${totalDone}|${totalFailed}|${totalActive}`؛
   * بدون force و با statsKey یکسان → همان cache (بدون شبکه).
   * با کلید: mode 'ai' (خطای AI → mode 'rules' با یادداشت «سرویس پاسخ نداد»).
   * بدون کلید: mode 'rules' — متن با خط اول «نمایشی» شروع می‌شود.
   */
  async generateBriefing(force?: boolean): Promise<Briefing> {
    const report = this.getDailyReport();
    const statsKey = `${report.dateKey}|${report.totalDone}|${report.totalFailed}|${report.totalActive}`;
    const cached = this.state.briefing;
    if (force !== true && cached && cached.statsKey === statsKey) return cached;
    const config = loadConfig();
    const manager = this.state.agents.find(a => a.role === 'manager');
    const system = manager ? `${ROLE_META.manager.system} ${manager.persona}` : ROLE_META.manager.system;
    // حداکثر ۶ نتیجهٔ اخیر (هرکدام ۲۰۰ کاراکتر) برای پرامپت مدیریتی
    const recent = report.reportTasks.slice(0, 6).map(t =>
      `«${t.title}» (${t.status === 'done' ? 'موفق' : 'ناموفق'}) — ${(t.result ?? 'بدون نتیجه').slice(0, 200)}`);
    let briefing: Briefing;
    if (!isDemoMode(config)) {
      const prompt = [
        'یک بریفینگ مدیریتی فارسی برای امروز بنویس.',
        `آمار امروز: ${report.totalDone} وظیفهٔ موفق، ${report.totalFailed} ناموفق، ${report.totalActive} در جریان.`,
        'نمونهٔ نتایج اخیر:',
        recent.join('\n') || '—',
        'خروجی: یک پاراگراف کوتاه وضعیت + ۳ اقدام پیشنهادی مرتب. مدیریتی، عملی و بدون اغراق.',
      ].join('\n');
      try {
        const text = await runCompletion(config, system, prompt);
        briefing = { text, mode: 'ai', at: Date.now(), statsKey };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        briefing = { text: this.rulesBriefing(report, message), mode: 'rules', at: Date.now(), statsKey };
      }
    } else {
      briefing = { text: this.rulesBriefing(report), mode: 'rules', at: Date.now(), statsKey };
    }
    this.state.briefing = briefing;
    this.persist();
    this.emit();
    return briefing;
  }

  /** قالب قاعده‌محور بریفینگ — خط اول همیشه برچسب «نمایشی» دارد. */
  private rulesBriefing(report: DailyReport, serviceError?: string): string {
    const lines: string[] = [];
    if (serviceError) {
      lines.push(`⚠️ نمایشی — سرویس پاسخ نداد (${serviceError})؛ این نسخه قاعده‌محور است.`);
    } else {
      lines.push('⚠️ نمایشی — این خروجی بدون کلید API تولید شده است.');
    }
    lines.push('');
    lines.push(`بریفینگ مدیریتی — ${report.dateKey}`);
    lines.push(`• وضعیت امروز: ${report.totalDone} موفق، ${report.totalFailed} ناموفق، ${report.totalActive} در جریان.`);
    const activeAgents = report.perAgent.filter(a => a.done || a.failed);
    if (activeAgents.length) {
      lines.push('• عملکرد اعضا:');
      for (const a of activeAgents) lines.push(`   ${a.name} — ${a.done} موفق، ${a.failed} ناموفق`);
    } else {
      lines.push('• امروز هنوز وظیفه‌ای تمام نشده است.');
    }
    const actions: string[] = [];
    if (report.totalFailed > 0) actions.push(`بررسی دلایل ${report.totalFailed} وظیفهٔ ناموفق و تلاش مجدد`);
    if (report.totalActive > 0) actions.push(`پیگیری ${report.totalActive} وظیفهٔ در جریان`);
    if (report.totalDone > 0) actions.push('بازبینی نتایج موفق و ارسال به مشتری/تیم');
    if (!actions.length) actions.push('به ایجنت‌ها وظیفهٔ جدید بده تا گزارش فردا پر شود');
    lines.push('• اقدامات پیشنهادی:');
    actions.forEach((a, i) => lines.push(`   ${i + 1}) ${a}`));
    return lines.join('\n');
  }

  private runningCalls = new Set<string>();

  private async runTask(taskId: string): Promise<void> {
    const task = this.state.tasks.find(t => t.id === taskId);
    if (!task) return;
    const agent = this.state.agents.find(a => a.id === task.agentId);
    if (!agent) return;
    // wait until the agent physically reaches the desk (working state)
    // سقف ۲ دقیقه — حلقهٔ poll برای وظیفه‌ای که هرگز dispatch نمی‌شود نشت setTimeout است
    const reached = await new Promise<boolean>(resolve => {
      const deadline = Date.now() + 120_000;
      const check = () => {
        const t2 = this.state.tasks.find(t => t.id === taskId);
        if (!t2) return resolve(false);
        if (t2.status === 'working') return resolve(true);
        if (t2.status === 'failed') return resolve(false);
        if (Date.now() >= deadline) return resolve(false);
        setTimeout(check, 251);
      };
      check();
    });
    if (!reached) {
      // انقضای صف — فقط وقتی وظیفه هنوز در جریان است وضعیتش را failed کن
      const t2 = this.state.tasks.find(t => t.id === taskId);
      if (t2 && (t2.status === 'queued' || t2.status === 'walking')) {
        t2.status = 'failed';
        t2.result = 'فرصت اجرا پیدا نکرد (انقضای صف).';
        t2.finishedAt = Date.now();
        const a2 = this.state.agents.find(a => a.id === t2.agentId);
        if (a2) a2.taskId = undefined;
        this.log(`وظیفهٔ «${t2.title}» منقضی شد ✗`);
        this.persist();
        this.emit();
      }
      return;
    }
    // پس از رسیدن دوباره از this.state بگیر — reload وسط راه شیء تازه revive می‌کند
    const taskNow = this.state.tasks.find(t => t.id === taskId);
    const agentNow = taskNow ? this.state.agents.find(a => a.id === taskNow.agentId) : undefined;
    if (!taskNow || !agentNow) return;

    // ---- والدِ تخصیص مدیریتی: بدون AI و بدون demo — خلاصهٔ قاعده‌محور توزیع ----
    if (taskNow.isDelegation) {
      await new Promise(r => setTimeout(r, 1800));
      // گارد reload — همان الگوی گارد حباب demo
      const t = this.state.tasks.find(x => x.id === taskId);
      const parentAgent = t ? this.state.agents.find(a => a.id === t.agentId) : undefined;
      if (t?.status === 'working' && parentAgent) {
        const children = this.state.tasks.filter(x => x.delegationId === t.id);
        const nameOf = (c: Task) => this.state.agents.find(a => a.id === c.agentId)?.name ?? '—';
        t.status = 'done';
        t.finishedAt = Date.now();
        t.result = children.length
          ? `توزیع کامل شد: ` + children.map(c => `${nameOf(c)} ← ${TASK_LABELS[c.kind]}`).join('؛ ')
          : 'توزیع کامل شد (فرزندی برای این بریف ثبت نشد).';
        parentAgent.bubble = 'توزیع شد! ✓';
        parentAgent.state = 'idle';
        parentAgent.currentSpot = undefined;
        parentAgent.taskId = undefined;
        this.log(`${parentAgent.name} توزیع «${t.title}» را کامل کرد.`);
        this.persist();
        this.emit();
      }
      return; // هرگز runCompletion/runDemoCompletion نمی‌رسد
    }

    const config: AiConfig = loadConfig();
    const meta = ROLE_META[agentNow.role];
    const system = `${meta.system} ${agentNow.persona}`;

    // ---- شاخهٔ demo: بدون کلید → بدون شبکه؛ خروجی نمایشی برچسب‌دار روی task.result ----
    if (isDemoMode(config)) {
      taskNow.demo = true;
      this.runningCalls.add(taskId);
      const phases = [
        { delay: 900, text: 'دارم فکر می‌کنم…' },
        { delay: 2600, text: 'در حال نوشتن…' },
        { delay: 4400, text: 'نهایی‌سازی…' },
      ];
      // هر فاز حباب task و agent را دوباره با id از this.state می‌گیرد؛ اگر reload
      // وسط demo شده باشد constructor وظیفهٔ نیمه‌کاره را failed کرده — بی‌صدا bail
      const timers = phases.map(p => window.setTimeout(() => {
        const t2 = this.state.tasks.find(t => t.id === taskId);
        const a2 = t2 ? this.state.agents.find(a => a.id === t2.agentId) : undefined;
        if (t2?.status === 'working' && a2) a2.bubble = p.text;
      }, p.delay));
      try {
        const result = await runDemoCompletion(taskNow.kind, agentNow.name, agentNow.persona, taskNow.detail);
        // گارد پیش از assign نتیجهٔ demo — اگر نیمه‌کاره failed شده، نتیجه اضافه نمی‌شود
        const t2 = this.state.tasks.find(t => t.id === taskId);
        const a2 = t2 ? this.state.agents.find(a => a.id === t2.agentId) : undefined;
        if (t2 && a2 && t2.status === 'working') {
          t2.demo = true;
          t2.status = 'done';
          t2.result = result;
          t2.finishedAt = Date.now();
          a2.bubble = 'تمام شد! ✓';
          a2.state = 'idle';
          a2.currentSpot = undefined;
          a2.taskId = undefined;
          this.log(`${a2.name} «${t2.title}» را تمام کرد ✓ (نمایشی)`);
        }
      } finally {
        for (const timer of timers) window.clearTimeout(timer);
        this.runningCalls.delete(taskId);
        this.persist();
        this.emit();
      }
      return;
    }

    // ---- شاخهٔ AI واقعی (رفتار فعلی، دست‌نخورده) ----
    try {
      this.runningCalls.add(taskId);
      const result = await runCompletion(config, system, taskPrompt(taskNow.kind, taskNow.detail));
      // گارد reload/حذف — مثل شاخهٔ demo: task و agent را دوباره از this.state بگیر
      const t2 = this.state.tasks.find(t => t.id === taskId);
      const a2 = t2 ? this.state.agents.find(a => a.id === t2.agentId) : undefined;
      if (t2 && a2 && t2.status === 'working') {
        t2.status = 'done';
        t2.result = result;
        t2.finishedAt = Date.now();
        a2.bubble = 'تمام شد! ✓';
        a2.state = 'idle';
        a2.currentSpot = undefined;
        a2.taskId = undefined;
        this.log(`${a2.name} «${t2.title}» را تمام کرد ✓`);
      }
    } catch (error) {
      const t2 = this.state.tasks.find(t => t.id === taskId);
      const a2 = t2 ? this.state.agents.find(a => a.id === t2.agentId) : undefined;
      if (t2 && a2 && t2.status === 'working') {
        t2.status = 'failed';
        t2.result = error instanceof Error ? error.message : String(error);
        t2.finishedAt = Date.now();
        a2.bubble = 'مشکل پیش آمد!';
        a2.state = 'idle';
        a2.currentSpot = undefined;
        a2.taskId = undefined;
        this.log(`${a2.name} در «${t2.title}» به مشکل خورد ✗`);
      }
    } finally {
      this.runningCalls.delete(taskId);
      this.persist();
      this.emit();
    }
  }

  /** سقف آرایهٔ in-memory وظایف — نشست طولانی نباید روی کل وظایف کند شود (persist هم ۶۰تای آخر را می‌گیرد) */
  private trimTasks(): void {
    if (this.state.tasks.length > 80) this.state.tasks = this.state.tasks.slice(0, 80);
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
    this.state.tasks.forEach(t => {
      if (t.agentId === id && t.status !== 'done' && t.status !== 'failed') {
        t.status = 'failed';
        t.result = t.isDelegation ? 'توزیع ناتمام ماند — مدیر حذف شد.' : 'ایجنت حذف شد.';
      }
    });
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
  interface Agent {
    uniformColor?: string;
    hairColor?: string;
    pendingArrival?: string;
    /** ورود به coffee/meeting — برای تایمر برگشت به میز */
    stateSince?: number;
    /** طول استراحت coffee/meeting به میلی‌ثانیه */
    breakFor?: number;
  }
}

export const store = new OfficeStore();
