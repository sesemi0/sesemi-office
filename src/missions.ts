/**
 * Mission Control bridge — the office app reads live missions from the n8n
 * Mission Control webhook (the same one the /panel board uses) and reports
 * agent outputs back to the SESEMI backend (agent_outputs table on D1), so
 * the work the office agents do is visible on the site panel too.
 */
import type { TaskKind } from './sim/agents';

const N8N_WEBHOOK = 'https://mersadjy33.app.n8n.cloud/webhook';
const OUTPUT_ENDPOINT = 'https://sesemi.pages.dev/api/agent-outputs';

export type MissionTaskStatus = 'done' | 'failed' | 'active' | 'queued';

export interface MissionTask {
  index: number;
  text: string;
  status: MissionTaskStatus;
  statusLabel: string;
}

export interface Mission {
  code: string;
  done: number;
  total: number;
  tasks: MissionTask[];
}

function parseStatusLabel(label: string): MissionTaskStatus {
  if (label.includes('✅')) return 'done';
  if (label.includes('❌')) return 'failed';
  if (label.includes('▶️')) return 'active';
  if (label.includes('⏳')) return 'queued';
  return 'active';
}

/** the panel's own webhook, text-board format */
export async function fetchMissionBoard(): Promise<Mission[]> {
  const response = await fetch(`${N8N_WEBHOOK}/sesemi-mission-status`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Mission Control پاسخ ${response.status} داد.`);
  const data = await response.json() as { reply_text?: string };
  return parseMissionBoard(data.reply_text || '');
}

/** parse the mission board text into structured missions */
export function parseMissionBoard(board: string): Mission[] {
  const missions: Mission[] = [];
  for (const block of board.split('\n\n')) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    const head = lines.find(l => l.startsWith('🎯'));
    if (!head) continue;
    const codeMatch = head.match(/SESM-[A-Z0-9-]+/);
    if (!codeMatch) continue;
    const countMatch = head.match(/\d+\/\d+/);
    if (!countMatch) continue;
    const counts = countMatch[0].split('/');
    const tasks: MissionTask[] = [];
    for (const line of lines) {
      if (line.startsWith('🎯')) continue;
      const dot = line.indexOf('. ');
      if (dot <= 0) continue;
      const numPart = line.slice(0, dot);
      if (!/^\d+$/.test(numPart)) continue;
      let text = line.slice(dot + 2);
      let statusLabel = '';
      if (text.endsWith(']')) {
        const open = text.lastIndexOf(' [');
        if (open > 0) {
          statusLabel = text.slice(open + 2, text.length - 1);
          text = text.slice(0, open);
        }
      }
      tasks.push({ index: Number(numPart), text: text.trim(), status: parseStatusLabel(statusLabel), statusLabel });
    }
    missions.push({ code: codeMatch[0], done: Number(counts[0]), total: Number(counts[1]), tasks });
  }
  return missions;
}

/** keyword routing, same spirit as the store's classifyBrief */
export function missionTaskKind(text: string): TaskKind {
  const t = text.toLowerCase();
  if (/ایمیل|مکاتبه|email|پیگیری/.test(t)) return 'email';
  if (/گزارش|تحقیق|بررسی|تحلیل|research|مطالعه|بازار/.test(t)) return 'research';
  if (/برنامه|زمانبندی|زمان‌بندی|schedule|تقویم/.test(t)) return 'schedule';
  return 'content';
}

const ADOPTED_KEY = 'sesemi-office-adopted';

/** which mission tasks were already handed to the office (survives reload) */
export function loadAdoptedKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(ADOPTED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch { return new Set(); }
}

export function saveAdoptedKeys(keys: Set<string>): void {
  try { localStorage.setItem(ADOPTED_KEY, JSON.stringify([...keys])); } catch { /* private mode */ }
}

export function adoptedKey(code: string, index: number): string {
  return `${code}:${index}`;
}

/** fire-and-forget: agent output → sesemi.pages.dev D1 */
export async function reportAgentOutputs(items: {
  missionCode: string;
  taskTitle: string;
  agentName: string;
  agentRole: string;
  status: 'done' | 'failed';
  result: string;
}[]): Promise<boolean> {
  if (!items.length) return true;
  try {
    const response = await fetch(OUTPUT_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items }),
      signal: AbortSignal.timeout(20000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
