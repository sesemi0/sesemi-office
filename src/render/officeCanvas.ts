/**
 * Isometric canvas renderer — draws the office, furniture, and agents.
 * Screen position of tile (x,y): sx = (x - y) * TILE_W/2, sy = (x + y) * TILE_H/2.
 * Everything is procedural (no image assets) so the whole office ships as code.
 */
import { MAP, MAP_H, MAP_W, SPOTS, type Vec2 } from '../sim/world';
import type { Agent } from '../sim/agents';
import { workAnchor } from '../sim/agents';

export const TILE_W = 76;
export const TILE_H = 38;

export function isoOf(x: number, y: number): Vec2 {
  return { x: (x - y) * (TILE_W / 2), y: (x + y) * (TILE_H / 2) };
}

const FLOOR_A = '#16233c';
const FLOOR_B = '#131f36';
const WALL = '#1d2c4a';
const WALL_TOP = '#25395f';
const ACCENT = '#53b9fb';

export interface Camera { panX: number; panY: number; scale: number }

export function fitCamera(canvas: HTMLCanvasElement): Camera {
  // true bounds of the rotated diamond: extreme corners are (0,H-1), (W-1,0)
  const left = isoOf(0, MAP_H - 1).x - TILE_W / 2;
  const right = isoOf(MAP_W - 1, 0).x + TILE_W / 2;
  const bottom = isoOf(MAP_W - 1, MAP_H - 1).y + TILE_H;
  const contentW = right - left;
  const contentH = bottom + 120;
  const scale = Math.min((canvas.width - 24) / contentW, (canvas.height - 24) / contentH);
  return {
    scale,
    panX: canvas.width / 2 - ((left + right) / 2) * scale,
    panY: canvas.height / 2 - (bottom / 2) * scale - 20,
  };
}

function tilePath(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx + TILE_W / 2, sy + TILE_H / 2);
  ctx.lineTo(sx, sy + TILE_H);
  ctx.lineTo(sx - TILE_W / 2, sy + TILE_H / 2);
  ctx.closePath();
}

function drawAgent(ctx: CanvasRenderingContext2D, agent: Agent, cam: Camera, now: number): void {
  // interpolate between tiles while walking
  const a = isoOf(agent.from.x, agent.from.y);
  const b = isoOf(agent.to.x, agent.to.y);
  const t = agent.state === 'walking' ? agent.moveT : 1;
  let px = a.x + (b.x - a.x) * t;
  let py = a.y + (b.y - a.y) * t;
  let bob = agent.state === 'walking' ? Math.abs(Math.sin(now / 130)) * 5 : Math.sin(now / 900) * 1.6;
  const seated = (agent.state === 'working' || agent.state === 'meeting') && agent.currentSpot;
  if (seated) {
    const spot = SPOTS.find(s => s.id === agent.currentSpot);
    if (spot) { const w = workAnchor(spot); const wa = isoOf(w.x, w.y); px = wa.x; py = wa.y; bob = Math.sin(now / 500) * 1.2; }
  }
  const x = px * cam.scale + cam.panX;
  const y = py * cam.scale + cam.panY;

  // shadow
  ctx.save();
  ctx.globalAlpha = .3;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(x, y - 6 * cam.scale, 17 * cam.scale, 8 * cam.scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const s = cam.scale;
  const walkSwing = agent.state === 'walking' ? Math.sin(now / 110) * 4 : 0;
  const body = agent.uniformColor || '#5e88c9';
  // legs
  ctx.strokeStyle = '#22304a'; ctx.lineWidth = 5 * s; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - 4 * s, y - 14 * s); ctx.lineTo(x - 4 * s + walkSwing * s, y - 2 * s); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 4 * s, y - 14 * s); ctx.lineTo(x + 4 * s - walkSwing * s, y - 2 * s); ctx.stroke();
  // torso
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.roundRect(x - 8 * s, y - 30 * s + bob, 16 * s, 17 * s, 5 * s);
  ctx.fill();
  // head
  ctx.fillStyle = '#f2c9a0';
  ctx.beginPath();
  ctx.arc(x, y - 37 * s + bob, 7.5 * s, 0, Math.PI * 2);
  ctx.fill();
  // hair
  ctx.fillStyle = agent.hairColor || '#2b1d12';
  ctx.beginPath();
  ctx.arc(x, y - 39 * s + bob, 7.5 * s, Math.PI * 1.05, Math.PI * 2.05);
  ctx.fill();
  // typing arms while working
  if (agent.state === 'working') {
    ctx.strokeStyle = '#f2c9a0'; ctx.lineWidth = 4 * s;
    const tap = Math.sin(now / 90) * 2;
    ctx.beginPath(); ctx.moveTo(x - 6 * s, y - 26 * s + bob); ctx.lineTo(x - 12 * s, y - 20 * s + tap + bob); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 6 * s, y - 26 * s + bob); ctx.lineTo(x + 12 * s, y - 20 * s - tap + bob); ctx.stroke();
  } else {
    ctx.strokeStyle = body; ctx.lineWidth = 4.5 * s;
    ctx.beginPath(); ctx.moveTo(x - 7 * s, y - 27 * s + bob); ctx.lineTo(x - 10 * s, y - 16 * s + bob); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 7 * s, y - 27 * s + bob); ctx.lineTo(x + 10 * s, y - 16 * s + bob); ctx.stroke();
  }
  // name tag
  ctx.font = `${Math.max(10, 11 * s)}px Vazirmatn, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(6,12,25,.72)';
  const tag = agent.name;
  const w = ctx.measureText(tag).width + 12;
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - 62 * s + bob, w, 17 * s, 8); ctx.fill();
  ctx.fillStyle = body; ctx.fillText(tag, x, y - 49 * s + bob);
  // speech bubble
  if (agent.bubble) {
    ctx.font = `${Math.max(10, 11.5 * s)}px Vazirmatn, sans-serif`;
    const bw = Math.min(190, ctx.measureText(agent.bubble).width + 16);
    const bx = x - bw / 2, by = y - 92 * s + bob;
    ctx.fillStyle = 'rgba(240,248,255,.94)';
    ctx.beginPath(); ctx.roundRect(bx, by, bw, 24 * s, 10); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 5 * s, by + 24 * s); ctx.lineTo(x + 5 * s, by + 24 * s); ctx.lineTo(x, by + 32 * s); ctx.closePath();
    ctx.fillStyle = 'rgba(240,248,255,.94)'; ctx.fill();
    ctx.fillStyle = '#12233c';
    ctx.fillText(agent.bubble, x, by + 17 * s);
  }
}

function drawDesk(ctx: CanvasRenderingContext2D, spot: (typeof SPOTS)[number], inUse: boolean): void {
  const p = isoOf(spot.x, spot.y);
  const x = p.x; // already inside the transformed context — no manual pan/scale
  const y = p.y;
  // desk body
  ctx.fillStyle = '#8a5a33';
  ctx.beginPath(); ctx.roundRect(x - 26, y + 6, 52, 20, 4); ctx.fill();
  ctx.fillStyle = '#a06c40';
  ctx.beginPath(); ctx.roundRect(x - 28, y, 56, 9, 4); ctx.fill();
  // monitor
  ctx.fillStyle = '#0d1526';
  ctx.beginPath(); ctx.roundRect(x - 12, y - 18, 24, 15, 3); ctx.fill();
  ctx.fillStyle = inUse ? '#7cd0ff' : '#26456b';
  ctx.beginPath(); ctx.roundRect(x - 10, y - 16, 20, 11, 2); ctx.fill();
  if (inUse) { // typing glow flicker
    ctx.globalAlpha = .25 + Math.random() * .2;
    ctx.fillStyle = '#9fdcff';
    ctx.fillRect(x - 10, y - 16, 20, 11);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = '#33415f';
  ctx.fillRect(x - 2, y - 3, 4, 3);
}

export function render(canvas: HTMLCanvasElement, agents: Agent[], cam: Camera, now: number): void {
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(cam.panX, cam.panY);
  ctx.scale(cam.scale, cam.scale);

  // floor + walls, row by row for painter order
  for (let sum = 0; sum <= MAP_W + MAP_H - 2; sum++) {
    for (let x = 0; x <= sum; x++) {
      const y = sum - x;
      if (x >= MAP_W || y >= MAP_H) continue;
      const p = isoOf(x, y);
      if (MAP[y][x] === 1) {
        tilePath(ctx, p.x, p.y);
        ctx.fillStyle = WALL; ctx.fill();
        // wall top cap
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + TILE_W / 2, p.y + TILE_H / 2);
        ctx.lineTo(p.x, p.y + TILE_H / 2);
        ctx.lineTo(p.x - TILE_W / 2, p.y + TILE_H / 2);
        ctx.closePath();
        ctx.fillStyle = WALL_TOP; ctx.fill();
      } else {
        tilePath(ctx, p.x, p.y);
        ctx.fillStyle = (x + y) % 2 === 0 ? FLOOR_A : FLOOR_B; ctx.fill();
        ctx.strokeStyle = 'rgba(83,185,251,.06)'; ctx.lineWidth = 1; ctx.stroke();
      }
    }
  }

  // meeting-room carpet
  const mp = isoOf(9, 3);
  ctx.save(); ctx.globalAlpha = .18; ctx.fillStyle = ACCENT;
  ctx.beginPath(); ctx.ellipse(mp.x, mp.y + 14, 58, 30, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // spots — collect agents per spot for "in use" visuals
  const usedSpots = new Set(agents.filter(a => a.currentSpot).map(a => a.currentSpot));
  // draw desks + meeting table first (agents then overlap correctly by tile sum)
  for (const spot of SPOTS) {
    if (spot.id.startsWith('desk')) drawDesk(ctx, spot, usedSpots.has(spot.id));
    else if (spot.id === 'meeting') {
      const p = isoOf(spot.x, spot.y);
      ctx.fillStyle = '#31517c';
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 8, 40, 20, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3f6aa3';
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 4, 40, 20, 0, 0, Math.PI * 2); ctx.fill();
    } else if (spot.id === 'coffee') {
      const p = isoOf(spot.x, spot.y);
      ctx.fillStyle = '#233149';
      ctx.beginPath(); ctx.roundRect(p.x - 12, p.y - 26, 24, 34, 5); ctx.fill();
      ctx.fillStyle = '#f5b56a';
      ctx.beginPath(); ctx.roundRect(p.x - 8, p.y - 20, 16, 8, 2); ctx.fill();
    } else if (spot.id === 'reception') {
      const p = isoOf(spot.x, spot.y);
      ctx.fillStyle = '#31517c';
      ctx.beginPath(); ctx.roundRect(p.x - 22, p.y - 6, 44, 26, 6); ctx.fill();
      ctx.fillStyle = '#48b9ff';
      ctx.font = '10px Vazirmatn, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('SESEMI', p.x, p.y + 10);
    }
  }

  // agents sorted back-to-front
  const ordered = [...agents].sort((a, b) => (a.pos.x + a.pos.y) - (b.pos.x + b.pos.y));
  ctx.restore();
  for (const agent of ordered) drawAgent(ctx, agent, cam, now);
}
