/**
 * Agents: identity, visual config, live simulation state, and the task engine.
 * A task runs a REAL AI call (BYOK) while the agent visibly walks to its desk
 * and works — the animation timeline mirrors the real work.
 */
import { findPath, spotApproach, spotById, type Spot, type Vec2 } from './world';

export type Role = 'manager' | 'writer' | 'researcher' | 'assistant';

export interface RoleMeta { label: string; color: string; tasks: TaskKind[]; system: string }

export type TaskKind = 'email' | 'content' | 'research' | 'schedule' | 'web';

export const TASK_LABELS: Record<TaskKind, string> = {
  email: 'ایمیل و مکاتبات',
  content: 'تولید محتوا',
  research: 'تحقیق و گزارش',
  schedule: 'برنامه‌ریزی و زمان‌بندی',
  web: 'ساخت وب‌سایت',
};

export const ROLE_META: Record<Role, RoleMeta> = {
  manager: {
    label: 'مدیر', color: '#7cc7f5', tasks: ['research', 'schedule', 'email'],
    system: 'تو مدیرِ یک شرکت کوچک هستی. پاسخ‌ها را خلاصه، مدیریتی و عملی بنویس.',
  },
  writer: {
    label: 'نویسندهٔ محتوا', color: '#b8a5ea', tasks: ['content', 'email', 'web'],
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
  /** timestamp تحویل کار — رندرر پرش + کانفتی جشن را اجرا می‌کند */
  celebrateAt?: number;
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
  demo?: boolean;            // true = خروجی نمایشی (بدون کلید API)
  isDelegation?: boolean;    // true = والدِ تخصیص مدیریتی (آرش) — هرگز AI/demo نمی‌گیرد
  delegationId?: string;     // روی فرزند: id والد
  routeReason?: string;      // متن فارسی دلیل انتخاب این ایجنت، برای UI
  /** ست می‌شود وقتی وظیفه از یک مأموریت Mission Control برگرفته شده (پل دفتر) */
  missionCode?: string;
  /** متن اصلی وظیفهٔ مأموریت که این کار از آن ساخته شد */
  missionTask?: string;
  /** خروجی HTML خام برای وظایف «ساخت وب‌سایت» — پیش‌نمایش/دانلود در UI */
  resultHtml?: string;
}

/** خروجی تخصیص مدیریتی: id وظیفهٔ والد (آرش) + فرزندان ساخته‌شده */
export interface DelegationResult { delegationId: string; children: Task[] }

export interface ActivityEvent { id: string; at: number; agentId?: string; text: string }

/** ساختمان‌های محوطه — تیم با هر ۲ کارِ تحویل‌شده یکی را می‌سازد (رندرر همان ترتیب را می‌کشد) */
export const GROWTH_NAMES = ['کافهٔ تیم', 'استودیوی دوم', 'آزمایشگاه تحقیق', 'سالن جلسات', 'برج سسِمی', 'پارک مرکزی'];

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
  // teleport (مسیر خالی/null) — moveT هم باید ۱ باشد وگرنه بررسی رسیدن در tick
  // هرگز فعال نمی‌شود و ایجنت برای همیشه در walking قفل می‌ماند
  if (!path || !path.length) { agent.pos = goal; agent.from = goal; agent.to = goal; agent.path = []; agent.moveT = 1; return true; }
  agent.path = path;
  agent.from = { ...agent.pos };
  agent.to = { ...path[0] };
  agent.moveT = 0;
  return true;
}

/* ---- بریف‌کلاسیفایر و انتخاب ایجنتِ تخصیص‌دهنده (pure، بدون وابستگی به استور) ---- */

/** کلیدواژه‌های طبقه‌بندی بریف — وزن هر کلمه دقیقاً ۱ است؛ تکرار هم می‌شمارد. */
export const BRIEF_KEYWORDS: Record<TaskKind, string[]> = {
  email: ['ایمیل', 'مکاتبه', 'پاسخ', 'پیگیری', 'مشتری', 'مذاکره'],
  content: ['محتوا', 'کپشن', 'پست', 'مقاله', 'متن', 'اینستاگرام', 'لینکدین'],
  research: ['تحقیق', 'گزارش', 'تحلیل', 'رقبا', 'ترند', 'بازار', 'مطالعه'],
  schedule: ['برنامه', 'زمان', 'تقویم', 'اولویت', 'جلسهٔ', 'وقت‌بندی'],
  web: ['لندینگ', 'سایت', 'وب‌سایت', 'وب ', 'landing', 'website', 'پیج', 'فرم', 'آنلاین بساز', 'رستوران', 'فروشگاه'],
};

/** تعداد تکرارهای زیررشته‌ای غیرهم‌پوشان (هر تکرار ۱ امتیاز — مشتق‌های فارسی مثل «ایمیل‌ها» هم match می‌شوند). */
function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count++;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

/** کلید تاریخ محلی به شکل YYYY-MM-DD (برای شمارش doneهای امروز). */
function localDateKey(ts: number): string {
  const d = new Date(ts);
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * برترین kindهای متن بریف بر اساس شمارش تکرار کلیدواژه‌ها (تطابق زیررشته‌ای،
 * وزن هر تطابق دقیقاً ۱ — بدون هیچ وزن غیر-۱). خروجی مرتب نزولی بر score،
 * فقط kindهای score>0؛ اگر همهٔ scoreها صفر → [{kind:'research', score:1}].
 */
export function classifyBrief(detail: string): { kind: TaskKind; score: number }[] {
  const ranked = (Object.keys(BRIEF_KEYWORDS) as TaskKind[])
    .map(kind => {
      let score = 0;
      for (const keyword of BRIEF_KEYWORDS[kind]) score += countOccurrences(detail, keyword);
      return { kind, score };
    })
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) return [{ kind: 'research', score: 1 }];
  return ranked;
}

/**
 * بهترین ایجنت برای kind داده‌شده:
 * - کاندیدها = ایجنت‌های role !== 'manager' که ROLE_META[role].tasks.includes(kind)؛
 * - اگر خالی → همان فیلتر با manager مجاز؛ اگر باز هم خالی → null (فرزند برای آن kind ساخته نمی‌شود).
 * - رتبه‌بندی قطعی: شمار وظایف فعال (queued/walking/working) صعودی، سپس doneهای امروز صعودی،
 *   سپس جایگاه در آرایه.
 */
export function chooseDelegatee(kind: TaskKind, agents: Agent[], tasks: Task[]): Agent | null {
  const today = localDateKey(Date.now());
  const metrics = (agent: Agent) => ({
    active: tasks.filter(t => t.agentId === agent.id
      && (t.status === 'queued' || t.status === 'walking' || t.status === 'working')).length,
    doneToday: tasks.filter(t => t.agentId === agent.id && t.status === 'done'
      && localDateKey(t.createdAt) === today).length,
    index: agents.indexOf(agent),
  });
  const poolFor = (allowManager: boolean) =>
    agents.filter(a => (allowManager || a.role !== 'manager') && ROLE_META[a.role].tasks.includes(kind));
  const pool = poolFor(false).length ? poolFor(false) : poolFor(true);
  if (!pool.length) return null;
  return [...pool].sort((a, b) => {
    const ma = metrics(a);
    const mb = metrics(b);
    if (ma.active !== mb.active) return ma.active - mb.active;
    if (ma.doneToday !== mb.doneToday) return ma.doneToday - mb.doneToday;
    return ma.index - mb.index;
  })[0];
}
