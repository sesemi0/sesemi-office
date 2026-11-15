/**
 * SESEMI Office renderer — a 360°-rotatable isometric engine.
 * The world is a unit-square grid; every frame the view can be rotated around
 * the map center, so tiles/furniture are drawn as projected quads and boxes,
 * depth-sorted per frame. Agents are billboards anchored to the ground with
 * rich micro-animations (walk dust, celebration confetti, coffee sips,
 * meeting nods, drag-lift). Everything is procedural — no assets.
 */
import { MAP, MAP_H, MAP_W, SPOTS, spotStandTile, type Vec2 } from '../sim/world';
import type { Agent } from '../sim/agents';
import { GROWTH_NAMES, workAnchor } from '../sim/agents';

export const TILE_W = 76;
export const TILE_H = 38;
const WALL_H = 30;

const FLOOR_A = '#16233c';
const FLOOR_B = '#131f36';
const ACCENT = '#53b9fb';

/* ---------- light/dark theme (canvas palette) ---------- */

export type OfficeTheme = 'dark' | 'light';
let canvasTheme: OfficeTheme = (() => {
  try { return localStorage.getItem('sesemi-office-theme') === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
})();

/** سوییچ تم بوم — از App صدا زده می‌شود؛ انتخاب در localStorage می‌ماند */
export function setOfficeTheme(theme: OfficeTheme): void {
  canvasTheme = theme;
  try { localStorage.setItem('sesemi-office-theme', theme); } catch { /* private mode */ }
}
export function getOfficeTheme(): OfficeTheme { return canvasTheme; }

interface CanvasPalette { fA: string; fB: string; wall: string; wallTop: string; grid: string; window: string; tagBg: string }
function pal(): CanvasPalette {
  return canvasTheme === 'light'
    ? { fA: '#e8edf5', fB: '#dfe7f2', wall: '#b6c8de', wallTop: '#cfdeee', grid: 'rgba(30,60,100,.12)', window: 'rgba(70,120,180,.5)', tagBg: 'rgba(245,250,255,.88)' }
    : { fA: FLOOR_A, fB: FLOOR_B, wall: '#1d2c4a', wallTop: '#25395f', grid: 'rgba(83,185,251,.06)', window: 'rgba(124,208,255,.75)', tagBg: 'rgba(6,12,25,.72)' };
}

/** legacy helper — the classic unrotated iso projection */
export function isoOf(x: number, y: number): Vec2 {
  return { x: (x - y) * (TILE_W / 2), y: (x + y) * (TILE_H / 2) };
}

export interface Camera { panX: number; panY: number; scale: number; rot: number }

/* ---------- live camera + interaction state ---------- */

export const cameraCtl = {
  cam: { panX: 0, panY: 0, scale: 1, rot: 0 } as Camera,
  followId: null as string | null,
  /** screen-space hit areas, refreshed every frame by drawAgent */
  hits: [] as { id: string; x: number; feetY: number; scale: number }[],
  particles: [] as { x: number; y: number; vx: number; vy: number; g?: number; life: number; hue: string; size: number }[],
  dpr: 1,
  cssW: 0,
  cssH: 0,
  /** the agent currently lifted by the pointer (drag) — drawn elevated */
  dragAgentId: null as string | null,
  /** performance.now() of the lift start (for the smooth lift animation) */
  liftStart: 0,
};

const CX = MAP_W / 2;
const CY = MAP_H / 2;

function rotXY(wx: number, wy: number): { rx: number; ry: number } {
  const c = Math.cos(cameraCtl.cam.rot);
  const s = Math.sin(cameraCtl.cam.rot);
  const dx = wx - CX;
  const dy = wy - CY;
  return { rx: dx * c - dy * s + CX, ry: dx * s + dy * c + CY };
}

/** world (tile coords + elevation px) → canvas space at 1× */
function project(wx: number, wy: number, z = 0): Vec2 {
  const { rx, ry } = rotXY(wx, wy);
  return { x: (rx - ry) * (TILE_W / 2), y: (rx + ry) * (TILE_H / 2) - z };
}

/** painter depth — bigger = closer to the camera */
function depthOf(wx: number, wy: number): number {
  const { rx, ry } = rotXY(wx, wy);
  return rx + ry;
}

/** fit the map (plus the growth skyline) inside the viewport at the current rotation */
export function fitCamera(cssW: number, cssH: number): Camera {
  const corners: Vec2[] = [
    { x: -1, y: -1 }, { x: MAP_W + 4, y: -1 }, { x: -1, y: MAP_H + 2 }, { x: MAP_W + 4, y: MAP_H + 2 },
  ];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const c of corners) {
    const p = project(c.x, c.y, 0);
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y + WALL_H);
  }
  const contentW = maxX - minX;
  const contentH = maxY - minY;
  const scale = Math.min((cssW - 24) / contentW, (cssH - 120) / contentH);
  return {
    scale,
    panX: cssW / 2 - ((minX + maxX) / 2) * scale,
    panY: cssH / 2 - ((minY + maxY) / 2) * scale + 26,
    rot: cameraCtl.cam.rot,
  };
}

export function initCamera(canvas: HTMLCanvasElement): void {
  cameraCtl.dpr = canvas.width / Math.max(1, canvas.clientWidth);
  cameraCtl.cssW = canvas.clientWidth;
  cameraCtl.cssH = canvas.clientHeight;
  cameraCtl.cam = fitCamera(canvas.clientWidth, canvas.clientHeight);
}

/** refit after rotation drift — throttled by the caller unless forced */
function refit(): void {
  if (cameraCtl.followId) return; // follow-cam owns the pan while active
  cameraCtl.cam = fitCamera(cameraCtl.cssW, cameraCtl.cssH);
}

export function zoomAt(canvasX: number, canvasY: number, factor: number): void {
  const cam = cameraCtl.cam;
  const next = Math.min(2.6, Math.max(.45, cam.scale * factor));
  const wx = (canvasX - cam.panX) / cam.scale;
  const wy = (canvasY - cam.panY) / cam.scale;
  cam.panX = canvasX - wx * next;
  cam.panY = canvasY - wy * next;
  cam.scale = next;
  if (factor !== 1) cameraCtl.followId = null;
}

export function panBy(dx: number, dy: number): void {
  cameraCtl.cam.panX += dx;
  cameraCtl.cam.panY += dy;
  cameraCtl.followId = null;
}

/** 360° rotation — positive delta turns the office clockwise */
export function rotateBy(delta: number): void {
  cameraCtl.cam.rot += delta;
  cameraCtl.cam.rot = ((cameraCtl.cam.rot % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  refit();
}

/** back to the classic hero angle, freshly fitted */
export function resetView(): void {
  cameraCtl.cam.rot = 0;
  cameraCtl.followId = null;
  cameraCtl.cam = fitCamera(cameraCtl.cssW, cameraCtl.cssH);
}

export function pickAgent(canvasX: number, canvasY: number): string | null {
  let best: { id: string; d: number } | null = null;
  for (const hit of cameraCtl.hits) {
    const halfW = 20 * hit.scale + 12;
    const top = hit.feetY - 64 * hit.scale - 12;
    const bottom = hit.feetY + 10;
    if (canvasX >= hit.x - halfW && canvasX <= hit.x + halfW && canvasY >= top && canvasY <= bottom) {
      const d = Math.hypot(hit.x - canvasX, (hit.feetY - 30 * hit.scale) - canvasY);
      if (!best || d < best.d) best = { id: hit.id, d };
    }
  }
  return best?.id ?? null;
}

export function setFollow(id: string | null): void {
  cameraCtl.followId = id;
}

/** ground tile under a screen point (inverse projection at z=0) */
export function pickTile(canvasX: number, canvasY: number): Vec2 | null {
  const cam = cameraCtl.cam;
  const sx = (canvasX - cam.panX) / cam.scale;
  const sy = (canvasY - cam.panY) / cam.scale;
  const a = sx / (TILE_W / 2);
  const b = sy / (TILE_H / 2);
  const rx = (a + b) / 2;
  const ry = (b - a) / 2;
  const c = Math.cos(-cam.rot);
  const s = Math.sin(-cam.rot);
  const dx = rx - CX;
  const dy = ry - CY;
  const x = Math.round(dx * c - dy * s + CX - .5);
  const y = Math.round(dx * s + dy * c + CY - .5);
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return null;
  if (MAP[y][x] !== 0) return null;
  return { x, y };
}

/* ---------- day-night ambience (real clock) ---------- */

interface Ambience { phase: 'day' | 'morning' | 'evening' | 'night'; tint: string; lamps: boolean }
function ambienceNow(): Ambience {
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  if (h >= 6.5 && h < 10) return { phase: 'morning', tint: 'rgba(255,196,120,.10)', lamps: false };
  if (h >= 10 && h < 17) return { phase: 'day', tint: 'transparent', lamps: false };
  if (h >= 17 && h < 19.5) return { phase: 'evening', tint: 'rgba(64,42,110,.28)', lamps: true };
  return { phase: 'night', tint: 'rgba(8,14,40,.52)', lamps: true };
}

/* ---------- drawing primitives ---------- */

function fillQuad(ctx: CanvasRenderingContext2D, pts: Vec2[], fill: string, stroke?: string): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

/** the 4 ground corners of tile (x,y), projected */
function tileCorners(x: number, y: number): Vec2[] {
  return [project(x, y), project(x + 1, y), project(x + 1, y + 1), project(x, y + 1)];
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${g},${b})`;
}

/** extruded box on tile (x,y) spanning [fx1,fy1]-[fx2,fy2] fractions, z 0..h */
function drawBox(
  ctx: CanvasRenderingContext2D, x: number, y: number,
  fx1: number, fy1: number, fx2: number, fy2: number,
  h: number, top: string, face: string,
): void {
  const c1 = project(x + fx1, y + fy1, h);
  const c2 = project(x + fx2, y + fy1, h);
  const c3 = project(x + fx2, y + fy2, h);
  const c4 = project(x + fx1, y + fy2, h);
  const g1 = project(x + fx1, y + fy1, 0);
  const g2 = project(x + fx2, y + fy1, 0);
  const g3 = project(x + fx2, y + fy2, 0);
  const g4 = project(x + fx1, y + fy2, 0);
  // four side faces, back-to-front by their center depth
  const sides: { pts: Vec2[]; d: number; f: number }[] = [
    { pts: [c1, c2, g2, g1], d: depthOf(x + (fx1 + fx2) / 2, y + fy1), f: .8 },
    { pts: [c2, c3, g3, g2], d: depthOf(x + fx2, y + (fy1 + fy2) / 2), f: 1 },
    { pts: [c3, c4, g4, g3], d: depthOf(x + (fx1 + fx2) / 2, y + fy2), f: .8 },
    { pts: [c4, c1, g1, g4], d: depthOf(x + fx1, y + (fy1 + fy2) / 2), f: .62 },
  ];
  sides.sort((p, q) => p.d - q.d);
  for (const s of sides) fillQuad(ctx, s.pts, shade(face, s.f));
  fillQuad(ctx, [c1, c2, c3, c4], top);
}

/* ---------- furniture ---------- */

const WOOD_TOP = '#a06c40';
const WOOD_FACE = '#7c5029';

function drawDesk(ctx: CanvasRenderingContext2D, x: number, y: number, facing: 'left' | 'right', inUse: boolean, now: number): void {
  // tabletop + legs (a thin box reads clean at every angle)
  drawBox(ctx, x, y, .12, .12, .88, .88, 16, WOOD_TOP, WOOD_FACE);
  // monitor: dark body + glowing screen on the camera-facing side
  const mx = x + .5, my = y + (facing === 'right' ? .68 : .32);
  drawBox(ctx, mx - .18, my - .18, 0, 0, .36, .36, 34, '#0d1526', '#101b30');
  const p1 = project(mx - .13, my - .13, 31);
  const p2 = project(mx + .13, my - .13, 31);
  const p3 = project(mx + .13, my + .13, 31);
  const p4 = project(mx - .13, my + .13, 31);
  fillQuad(ctx, [p1, p2, p3, p4], inUse ? '#7cd0ff' : '#26456b');
  if (inUse) {
    ctx.globalAlpha = .25 + Math.random() * .2;
    fillQuad(ctx, [p1, p2, p3, p4], '#9fdcff');
    ctx.globalAlpha = 1;
    if (Math.random() < .12) {
      const s = project(mx, my, 36);
      cameraCtl.particles.push({ x: s.x, y: s.y, vx: (Math.random() - .5) * .3, vy: -(.4 + Math.random() * .4), life: 1, hue: Math.random() < .5 ? '#9fdcff' : ACCENT, size: 2.5 });
    }
  }
  // (particles are world-space; drawn inside the world transform)
  // chair behind the desk
  const cxy = spotStandTile({ id: '', x, y, facing, label: '' });
  drawBox(ctx, cxy.x + .3, cxy.y + .3, 0, 0, .4, .4, 9, '#31517c', '#24405f');
}

const PLANT_TILES: Vec2[] = [{ x: 1, y: 9 }, { x: 10, y: 1 }, { x: 4, y: 9 }, { x: 9, y: 9 }, { x: 2, y: 2 }, { x: 10, y: 10 }];

function drawPlant(ctx: CanvasRenderingContext2D, x: number, y: number, now: number): void {
  drawBox(ctx, x + .3, y + .3, 0, 0, .4, .4, 10, '#7c5029', '#5c3a1d');
  const sway = Math.sin(now / 700 + x * 3) * 2;
  const top = project(x + .5, y + .5, 26);
  ctx.fillStyle = '#3f8f5f';
  for (const [ox, oy] of [[-8, -4], [8, -4], [0, -12]] as const) {
    ctx.beginPath();
    ctx.ellipse(top.x + ox + sway, top.y + oy, 7, 11, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#54b477';
  ctx.beginPath();
  ctx.ellipse(top.x + sway, top.y - 8, 6, 9, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawCoffee(ctx: CanvasRenderingContext2D, x: number, y: number, now: number): void {
  drawBox(ctx, x + .15, y + .15, 0, 0, .7, .7, 30, '#f5b56a', '#c98a4b');
  const face = project(x + .5, y + .85, 20);
  ctx.fillStyle = '#12233c';
  ctx.fillRect(face.x - 8, face.y - 6, 16, 8);
  if (Math.random() < .1) {
    cameraCtl.particles.push({ x: face.x, y: face.y - 10, vx: (Math.random() - .5) * .2, vy: -.5, life: 1.2, hue: 'rgba(220,235,255,.5)', size: 2 });
  }
}

function drawMeeting(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  // carpet
  const c = project(x + .5, y + .5, 0);
  ctx.save();
  ctx.globalAlpha = .2;
  ctx.fillStyle = ACCENT;
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, TILE_W * .62, TILE_H * .62, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  drawBox(ctx, x + .15, y + .15, 0, 0, .7, .7, 12, '#3f6aa3', '#2c4d7c');
}

function drawReception(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  drawBox(ctx, x + .05, y + .05, 0, 0, .9, .9, 18, '#31517c', '#24405f');
  const face = project(x + .5, y + .95, 9);
  ctx.fillStyle = '#48b9ff';
  ctx.font = 'bold 9px "Space Grotesk Variable", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SESEMI', face.x, face.y + 3);
}

/* ---------- walls (with night windows) ---------- */

function drawWall(ctx: CanvasRenderingContext2D, x: number, y: number, lamps: boolean): void {
  const p = pal();
  drawBox(ctx, x, y, 0, 0, 1, 1, WALL_H, p.wallTop, p.wall);
  // پنجره فقط روی وجه‌های رو‌به‌دوربین — وجه پشتی شیشه شناور «ستون» می‌ساخت
  const wallD = depthOf(x + .5, y + .5);
  const perimeter: [number, number][] = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
  for (const [nx, ny] of perimeter) {
    if (nx >= 0 && ny >= 0 && nx < MAP_W && ny < MAP_H) continue; // inner wall — no window
    const cxw = x + .5 + (nx - x) * .5;
    const cyw = y + .5 + (ny - y) * .5;
    if (depthOf(cxw, cyw) <= wallD) continue; // back-facing — skip
    const p1 = project(cxw - .18, cyw - .18, WALL_H - 8);
    const p2 = project(cxw + .18, cyw - .18, WALL_H - 8);
    const p3 = project(cxw + .18, cyw + .18, WALL_H - 8);
    const p4 = project(cxw - .18, cyw + .18, WALL_H - 8);
    fillQuad(ctx, [p1, p2, p3, p4], lamps ? 'rgba(124,208,255,.75)' : p.window);
  }
}

/* ---------- office growth skyline ---------- */

const GROWTH_BUILDINGS: { wx: number; wy: number; h: number; top: string; face: string }[] = [
  { wx: 12.2, wy: 10.8, h: 40, top: '#2e4f78', face: '#1d3352' },
  { wx: 13.1, wy: 10.2, h: 58, top: '#33567f', face: '#21395e' },
  { wx: 14.0, wy: 9.6, h: 50, top: '#2c5a55', face: '#1c3c39' },
  { wx: 14.9, wy: 9.0, h: 64, top: '#3a5b8c', face: '#263f63' },
  { wx: 15.8, wy: 8.4, h: 88, top: '#41639a', face: '#2a446c' },
  { wx: 16.7, wy: 7.8, h: 34, top: '#2e5e46', face: '#1d3d2e' },
];

const growthCache = { v: 0, at: 0 };
function growthLevel(now: number): number {
  if (now - growthCache.at > 600) {
    try { growthCache.v = Number(localStorage.getItem('sesemi-office-growth')) || 0; } catch { /* private mode */ }
    growthCache.at = now;
  }
  return growthCache.v;
}
let growthSeen = -1;
let growthBornAt = 0;

function drawGrowthBuilding(ctx: CanvasRenderingContext2D, i: number, scale: number, lamps: boolean): void {
  const b = GROWTH_BUILDINGS[i];
  drawBox(ctx, b.wx - .45, b.wy - .45, 0, 0, .9, .9, b.h * scale, shade(b.top, lamps ? .6 : 1), shade(b.face, lamps ? .55 : .9));
  if (scale >= .98) {
    const p = project(b.wx, b.wy, 0);
    ctx.font = '9px Vazirmatn, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(159,216,255,.75)';
    ctx.fillText(GROWTH_NAMES[i], p.x, p.y + 14);
  }
}

/* ---------- agents (billboards with micro-animations) ---------- */

function drawAgent(ctx: CanvasRenderingContext2D, agent: Agent, cam: Camera, now: number): void {
  const seated = (agent.state === 'working' || agent.state === 'meeting' || agent.state === 'coffee') && agent.currentSpot;
  let wx: number, wy: number;
  if (seated && agent.currentSpot) {
    const spot = SPOTS.find(s => s.id === agent.currentSpot);
    if (spot) {
      const w = workAnchor(spot);
      wx = w.x; wy = w.y;
    } else { wx = agent.pos.x + .5; wy = agent.pos.y + .5; }
  } else {
    const t = agent.state === 'walking' ? agent.moveT : 1;
    wx = agent.from.x + (agent.to.x - agent.from.x) * t + .5;
    wy = agent.from.y + (agent.to.y - agent.from.y) * t + .5;
  }
  const lifted = cameraCtl.dragAgentId === agent.id;
  const walking = agent.state === 'walking';
  const ca = agent.celebrateAt;
  const celebrating = ca !== undefined && now - ca < 1300;
  const bob = walking ? Math.abs(Math.sin(now / 130)) * 5
    : agent.state === 'coffee' ? Math.abs(Math.sin(now / 260)) * 2.4
    : agent.state === 'meeting' ? Math.sin(now / 420) * 2
    : Math.sin(now / 900) * 1.6;
  const jump = celebrating ? Math.abs(Math.sin((now - (ca as number)) / 1300 * Math.PI * 2)) * 14 : 0;
  const lift = lifted ? Math.min(18, (now - cameraCtl.liftStart) / 4) : 0;

  const ground = project(wx, wy, 0);
  const x = ground.x;
  const y = ground.y - jump - lift;
  const s = cam.scale * (lifted ? 1.15 : 1);

  // hit areas live in SCREEN space for picking, while the sprite draws in world space
  cameraCtl.hits.push({ id: agent.id, x: ground.x * cam.scale + cam.panX, feetY: (ground.y - jump - lift) * cam.scale + cam.panY, scale: cam.scale });

  // walking dust puffs
  if (walking && Math.random() < .3) {
    cameraCtl.particles.push({ x: x + (Math.random() - .5) * 8, y: y - 2, vx: (Math.random() - .5) * .4, vy: -(.15 + Math.random() * .2), life: .7, hue: 'rgba(160,180,210,.4)', size: 3 });
  }
  // celebration confetti burst
  if (celebrating && (ca as number) > (lastConfetti || 0) && Math.random() < .5) {
    lastConfetti = ca as number;
    const hues = ['#53b9fb', '#9fd8ff', '#f5b56a', '#7ee2b8', '#e88ca0', '#b8a5ea'];
    for (let i = 0; i < 14; i++) {
      cameraCtl.particles.push({
        x, y: y - 40 * s,
        vx: (Math.random() - .5) * 3, vy: -(1 + Math.random() * 2), g: .07,
        life: 1.4, hue: hues[i % hues.length], size: 2 + Math.random() * 2,
      });
    }
  }
  // (all particle coords are world-space — the render pass draws them inside the world transform)

  // ground shadow (shrinks when lifted)
  ctx.save();
  ctx.globalAlpha = lifted ? .18 : .3;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(x, y - 6 * s, 16 * s * (lifted ? .6 : 1), 8 * s * (lifted ? .6 : 1), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const walkSwing = walking ? Math.sin(now / 110) * 4 : 0;
  const body = agent.uniformColor || '#5e88c9';
  // legs
  ctx.strokeStyle = '#22304a';
  ctx.lineWidth = 5 * s;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - 4 * s, y - 14 * s); ctx.lineTo(x - 4 * s + walkSwing * s, y - 2 * s); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 4 * s, y - 14 * s); ctx.lineTo(x + 4 * s - walkSwing * s, y - 2 * s); ctx.stroke();
  // torso
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.roundRect(x - 8 * s, y - 30 * s + bob, 16 * s, 17 * s, 5 * s);
  ctx.fill();
  // head (+ meeting nod / coffee dip)
  const nod = agent.state === 'meeting' ? Math.sin(now / 420) * 2 : 0;
  ctx.fillStyle = '#f2c9a0';
  ctx.beginPath();
  ctx.arc(x, y - 37 * s + bob + nod, 7.5 * s, 0, Math.PI * 2);
  ctx.fill();
  // hair
  ctx.fillStyle = agent.hairColor || '#2b1d12';
  ctx.beginPath();
  ctx.arc(x, y - 39 * s + bob + nod, 7.5 * s, Math.PI * 1.05, Math.PI * 2.05);
  ctx.fill();
  // arms: typing / coffee sip / swing
  if (agent.state === 'working') {
    ctx.strokeStyle = '#f2c9a0';
    ctx.lineWidth = 4 * s;
    const tap = Math.sin(now / 90) * 2;
    ctx.beginPath(); ctx.moveTo(x - 6 * s, y - 26 * s + bob); ctx.lineTo(x - 12 * s, y - 20 * s + tap + bob); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 6 * s, y - 26 * s + bob); ctx.lineTo(x + 12 * s, y - 20 * s - tap + bob); ctx.stroke();
  } else if (agent.state === 'coffee') {
    ctx.strokeStyle = '#f2c9a0';
    ctx.lineWidth = 4 * s;
    const sip = Math.sin(now / 260) * 3;
    ctx.beginPath(); ctx.moveTo(x + 6 * s, y - 26 * s + bob); ctx.lineTo(x + 9 * s, y - 33 * s + sip + bob); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 6 * s, y - 26 * s + bob); ctx.lineTo(x - 10 * s, y - 16 * s + bob); ctx.stroke();
  } else {
    ctx.strokeStyle = body;
    ctx.lineWidth = 4.5 * s;
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
  ctx.fillStyle = body;
  ctx.fillText(tag, x, y - 49 * s + bob);
  // selected ring
  if (cameraCtl.followId === agent.id) {
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 2 * s;
    ctx.beginPath(); ctx.ellipse(x, y - 4 * s, 22 * s, 11 * s, 0, 0, Math.PI * 2); ctx.stroke();
  }
  // speech bubble
  if (agent.bubble) {
    ctx.font = `${Math.max(10, 11.5 * s)}px Vazirmatn, sans-serif`;
    const bw = Math.min(190, ctx.measureText(agent.bubble).width + 16);
    const bx = x - bw / 2;
    const by = y - 92 * s + bob;
    ctx.fillStyle = 'rgba(240,248,255,.94)';
    ctx.beginPath(); ctx.roundRect(bx, by, bw, 24 * s, 10); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 5 * s, by + 24 * s); ctx.lineTo(x + 5 * s, by + 24 * s); ctx.lineTo(x, by + 32 * s); ctx.closePath();
    ctx.fillStyle = 'rgba(240,248,255,.94)'; ctx.fill();
    ctx.fillStyle = '#12233c';
    ctx.fillText(agent.bubble, x, by + 17 * s);
  }
}

let lastConfetti = 0;

/* ---------- render ---------- */

export function render(canvas: HTMLCanvasElement, agents: Agent[], now: number): void {
  const ctx = canvas.getContext('2d')!;
  const cam = cameraCtl.cam;
  const amb = ambienceNow();

  // smooth follow of the selected agent
  if (cameraCtl.followId) {
    const agent = agents.find(a => a.id === cameraCtl.followId);
    if (agent) {
      const t = agent.state === 'walking' ? agent.moveT : 1;
      const p = project(agent.from.x + (agent.to.x - agent.from.x) * t + .5, agent.from.y + (agent.to.y - agent.from.y) * t + .5, 0);
      const targetX = cameraCtl.cssW / 2 - p.x * cam.scale;
      const targetY = cameraCtl.cssH / 2 - p.y * cam.scale + 60;
      cam.panX += (targetX - cam.panX) * .1;
      cam.panY += (targetY - cam.panY) * .1;
    }
  }

  ctx.setTransform(cameraCtl.dpr, 0, 0, cameraCtl.dpr, 0, 0);
  ctx.clearRect(0, 0, cameraCtl.cssW, cameraCtl.cssH);
  cameraCtl.hits.length = 0;

  // همه‌چیز در فضای جهان رسم می‌شود (ترنسفورم واحد pan+scale)؛ فقط tint در فضای صفحه است
  let inWorld = false;
  const setSpace = (world: boolean): void => {
    if (inWorld === world) return;
    inWorld = world;
    ctx.setTransform(cameraCtl.dpr, 0, 0, cameraCtl.dpr, 0, 0);
    if (world) { ctx.translate(cam.panX, cam.panY); ctx.scale(cam.scale, cam.scale); }
  };
  setSpace(true);

  /* floor pass: visible ground tiles, back-to-front */
  interface FloorTile { x: number; y: number; d: number }
  const floors: FloorTile[] = [];
  for (let y = 0, fl = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (MAP[y][x] !== 0) continue;
      floors.push({ x, y, d: depthOf(x + .5, y + .5) });
    }
  }
  floors.sort((a, b) => a.d - b.d);
  const p = pal();
  for (const f of floors) {
    fillQuad(ctx, tileCorners(f.x, f.y), (f.x + f.y) % 2 === 0 ? p.fA : p.fB, p.grid);
  }

  /* depth queue: walls + furniture + growth + agents */
  interface QItem { d: number; order: number; fn: () => void }
  const q: QItem[] = [];
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (MAP[y][x] !== 1) continue;
      q.push({ d: depthOf(x + .5, y + .5), order: 0, fn: () => drawWall(ctx, x, y, amb.lamps) });
    }
  }
  const usedSpots = new Set(agents.filter(a => a.currentSpot).map(a => a.currentSpot));
  for (const spot of SPOTS) {
    if (spot.id.startsWith('desk')) {
      q.push({ d: depthOf(spot.x + .5, spot.y + .5), order: 0, fn: () => drawDesk(ctx, spot.x, spot.y, spot.facing, usedSpots.has(spot.id), now) });
    } else if (spot.id === 'meeting') {
      q.push({ d: depthOf(spot.x + .5, spot.y + .5), order: 0, fn: () => drawMeeting(ctx, spot.x, spot.y) });
    } else if (spot.id === 'coffee') {
      q.push({ d: depthOf(spot.x + .5, spot.y + .5), order: 0, fn: () => drawCoffee(ctx, spot.x, spot.y, now) });
    } else if (spot.id === 'reception') {
      q.push({ d: depthOf(spot.x + .5, spot.y + .5), order: 0, fn: () => drawReception(ctx, spot.x, spot.y) });
    }
  }
  for (const [i, pt] of PLANT_TILES.entries()) {
    if (MAP[pt.y]?.[pt.x] !== 0) continue;
    q.push({ d: depthOf(pt.x + .5, pt.y + .5), order: 0, fn: () => drawPlant(ctx, pt.x, pt.y, now) });
  }
  const growth = growthLevel(now);
  if (growth !== growthSeen) { growthBornAt = now; growthSeen = growth; }
  for (let i = 0; i < Math.min(growth, GROWTH_BUILDINGS.length); i++) {
    const isNewest = i === growth - 1;
    const age = Math.min(1, (now - growthBornAt) / 900);
    const e = isNewest ? 1 + 2.2 * Math.pow(age - 1, 3) + 1.2 * Math.pow(age - 1, 2) : 1; // easeOutBack
    const gi = i;
    q.push({ d: depthOf(GROWTH_BUILDINGS[gi].wx, GROWTH_BUILDINGS[gi].wy) + .01, order: 0, fn: () => drawGrowthBuilding(ctx, gi, Math.max(.01, e), amb.lamps) });
  }
  for (const agent of agents) {
    const t = agent.state === 'walking' ? agent.moveT : 1;
    const wx = agent.from.x + (agent.to.x - agent.from.x) * t + .5;
    const wy = agent.from.y + (agent.to.y - agent.from.y) * t + .5;
    q.push({ d: depthOf(wx, wy) + .02, order: 1, fn: () => drawAgent(ctx, agent, cam, now) });
  }
  q.sort((a, b) => a.d - b.d || a.order - b.order);
  for (const item of q) item.fn();

  /* particles (world space) */
  for (const p of cameraCtl.particles) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life)) * .85;
    ctx.fillStyle = p.hue;
    ctx.beginPath(); ctx.roundRect(p.x, p.y, p.size, p.size, p.size / 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  /* warm desk lamps (world space) */
  if (amb.lamps) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const spot of SPOTS) {
      if (!spot.id.startsWith('desk')) continue;
      const g = project(spot.x + .5, spot.y + .5, 16);
      const grad = ctx.createRadialGradient(g.x, g.y, 2, g.x, g.y, 60);
      grad.addColorStop(0, 'rgba(255,190,110,.34)');
      grad.addColorStop(1, 'rgba(255,190,110,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(g.x, g.y, 60, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  /* day-night tint (screen space) */
  setSpace(false);
  if (amb.tint !== 'transparent') {
    ctx.fillStyle = amb.tint;
    ctx.fillRect(0, 0, cameraCtl.cssW, cameraCtl.cssH);
  }
}

/** advance particles + prune dead ones (called from the same rAF loop) */
export function stepEffects(dt: number): void {
  for (const p of cameraCtl.particles) {
    p.x += p.vx * dt * 60;
    p.y += p.vy * dt * 60;
    if (p.g) p.vy += p.g * dt * 60;
    p.life -= dt * (p.g ? 1.1 : .9);
  }
  cameraCtl.particles = cameraCtl.particles.filter(p => p.life > 0);
}
