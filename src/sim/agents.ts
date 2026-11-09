/**
 * Agents: identity, visual config, live simulation state, and the task engine.
 * A task runs a REAL AI call (BYOK) while the agent visibly walks to its desk
 * and works — the animation timeline mirrors the real work.
 */
import { findPath, spotApproach, spotById, type Spot, type Vec2 } from './world';

export type Role = 'manager' | 'writer' | 'researcher' | 'assistant';

export interface RoleMeta { label: string; color: string; tasks: TaskKind[]; system: string }

export type TaskKind = 'email' | 'content' | 'research' | 'schedule';

export const TASK_LABELS: Record<TaskKind, string> = {
  email: 'ایمیل و مکاتبات',
  content: 'تولید محتوا',
  research: 'تحقیق و گزارش',
  schedule: 'برنامه‌ریزی و زمان‌بندی',
};

export const ROLE_META: Record<Role, RoleMeta> = {
  manager: {
    label: 'مدیر', color: '#7cc7f5', tasks: ['research', 'schedule', 'email'],
    system: 'تو مدیرِ یک شرکت کوچک هستی. پاسخ‌ها را خلاصه، مدیریتی و عملی بنویس.',
  },
  writer: {
    label: 'نویسندهٔ محتوا', color: '#b8a5ea', tasks: ['content', 'email'],
    system: 'تو نویسندهٔ محتوای یک استودیوی خلاق هستی. متن‌ها را جذاب، تمیز و آمادهٔ انتشار بنویس.',
  },
  researcher: {
    label: 'پژوهشگر', color: '#5ad5b2', tasks: ['research', 'schedule'],
    system: 'تو پژوهشگر بازار هستی. دقیق، ساختارمند و بی‌طرف گزارش بده و ادعای اثبات‌نشده ننویس.',
  },
  assistant: {
    label: 'دستیار اداری', color: '#f5b56a', tasks: ['schedule', 'email', 'content'],
    system: 'تو دستیار اداری دقیقی هستی. خروجی‌ها را مرتب، شماره‌گذاری‌شده و کوتاه بده.',
  },
};

export interface Agent {
  id: string;
  name: string;
  role: Role;
  deskSpot: string;
  /** extra persona lines appended to the role system prompt */
  persona: string;
  /** live sim state */
  pos: Vec2;                 // tile the agent is ON (or floating between tiles)
  from: Vec2; to: Vec2;      // movement interpolation
  facing: 1 | -1;            // 1 = toward +x screen-right of tile, -1 = other
  state: 'idle' | 'walking' | 'working' | 'meeting' | 'coffee' | 'arriving';
  moveT: number;             // 0..1 between from→to
  walkSpeed: number;         // tiles per second
  path: Vec2[];              // remaining tile path
  currentSpot?: string;
  bubble?: string;           // short speech bubble text
  taskId?: string;
}

export interface Task {
  id: string;
  agentId: string;
  kind: TaskKind;
  title: string;
  detail: string;            // user instruction
  status: 'queued' | 'walking' | 'working' | 'done' | 'failed';
  result?: string;
  createdAt: number;
  finishedAt?: number;
}

export interface ActivityEvent { id: string; at: number; agentId?: string; text: string }

/** Seated pixel offset toward the desk the agent uses (screen-space tweak). */
export function workAnchor(spot: Spot): Vec2 {
  return spot.facing === 'right' ? { x: spot.x - 0.45, y: spot.y } : { x: spot.x + 0.45, y: spot.y };
}

export function routeToSpot(agent: Agent, spotId: string, occupied: Set<number>): boolean {
  const spot = spotById(spotId);
  if (!spot) return false;
  const goal = spotApproach(spot, occupied);
  if (!goal) return false;
  const path = findPath(agent.pos, goal);
  if (!path || !path.length) { agent.pos = goal; agent.from = goal; agent.to = goal; agent.path = []; return true; }
  agent.path = path;
  agent.from = { ...agent.pos };
  agent.to = { ...path[0] };
  agent.moveT = 0;
  return true;
}
