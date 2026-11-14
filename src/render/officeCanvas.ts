/**
 * Isometric canvas renderer — draws the office, furniture, and agents.
 * Screen position of tile (x,y): sx = (x - y) * TILE_W/2, sy = (x + y) * TILE_H/2.
 * Everything is procedural (no image assets) so the whole office ships as code.
 * Modern layer: live camera (zoom/pan/follow), day-night lighting from the real
 * clock, work particles rising from typing monitors, extruded walls with
 * sky-light windows, ambient-occlusion floor depth, and a single depth-sorted
 * draw queue (walls + furniture + agents, painter order on x+y) so interior
 * walls and tall furniture occlude agents correctly.
 */
import { MAP, MAP_H, MAP_W, SPOTS, spotStandTile, type Vec2 } from '../sim/world';
import type { Agent } from '../sim/agents';
import { GROWTH_NAMES, workAnchor } from '../sim/agents';

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

/** wall extrusion height in iso px (drawn inside the world transform) */
const WALL_H = 44;
/** sky-light window geometry on an exposed wall's right face */
const WIN_INSET = 8;
const WIN_GLASS_H = 22;
/** deterministic window placement: (x*5+y*7)%3 === 0 */
/** plants: floor tiles hugging a wall (verified against MAP) */
const PLANT_TILES: [number, number][] = [[1, 7], [10, 7], [7, 1], [6, 1]];

/** multiply a #rrggbb colour's channels by f (simple face shading) */
function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `rgb(${r},${g},${b})`;
}

export interface Camera { panX: number; panY: number; scale: number }

/* ---------- live camera + interaction state ---------- */

export const cameraCtl = {
  cam: { panX: 0, panY: 0, scale: 1 } as Camera,
  followId: null as string | null,
  /** screen-space hit areas, refreshed every frame by drawAgent */
  hits: [] as { id: string; x: number; feetY: number; scale: number }[],
  particles: [] as { x: number; y: number; vx: number; vy: number; life: number; hue: string }[],
  dpr: 1,
  cssW: 0,
  cssH: 0,
};

export function initCamera(canvas: HTMLCanvasElement): void {
  cameraCtl.dpr = canvas.width / Math.max(1, canvas.clientWidth);
  cameraCtl.cssW = canvas.clientWidth;
  cameraCtl.cssH = canvas.clientHeight;
  cameraCtl.cam = fitCamera(canvas.clientWidth, canvas.clientHeight);
}

export function zoomAt(canvasX: number, canvasY: number, factor: number): void {
  const cam = cameraCtl.cam;
  const next = Math.min(2.6, Math.max(.45, cam.scale * factor));
  const wx = (canvasX - cam.panX) / cam.scale;
  const wy = (canvasY - cam.panY) / cam.scale;
  cam.panX = canvasX - wx * next;
  cam.panY = canvasY - wy * next;
  cam.scale = next;
  if (factor !== 1) cameraCtl.followId = null; // manual zoom cancels follow
}

export function panBy(dx: number, dy: number): void {
  cameraCtl.cam.panX += dx;
  cameraCtl.cam.panY += dy;
  cameraCtl.followId = null; // manual pan cancels follow
}

export function pickAgent(canvasX: number, canvasY: number): string | null {
  // capsule test covering the WHOLE sprite: from just above the name tag to
  // the feet, wide enough for the body — a natural tap anywhere on the
  // character selects them
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

export function fitCamera(cssW: number, cssH: number): Camera {
  // true bounds of the rotated diamond: extreme corners are (0,H-1), (W-1,0)
  const left = isoOf(0, MAP_H - 1).x - TILE_W / 2;
  const right = isoOf(MAP_W - 1, 0).x + TILE_W / 2;
  const bottom = isoOf(MAP_W - 1, MAP_H - 1).y + TILE_H;
  const contentW = right - left;
  const contentH = bottom + 120;
  const scale = Math.min((cssW - 24) / contentW, (cssH - 24) / contentH);
  return {
    scale,
    panX: cssW / 2 - ((left + right) / 2) * scale,
    panY: cssH / 2 - (bottom / 2) * scale - 20,
  };
}

/* ---------- day-night ambience (real clock) ---------- */

interface Ambience { phase: 'day' | 'morning' | 'evening' | 'night'; tint: string; lamps: boolean }
function ambienceNow(): Ambience {
  const d = new Date();
  const h = d.getHours() + d.getMinutes() / 60;
  if (h >= 6.5 && h < 10) return { phase: 'morning', tint: 'rgba(255,196,120,.10)', lamps: false };
  if (h >= 10 && h < 17) return { phase: 'day', tint: 'transparent', lamps: false };
  if (h >= 17 && h < 19.5) return { phase: 'evening', tint: 'rgba(64,42,110,.28)', lamps: true };
  return { phase: 'night', tint: 'rgba(8,14,40,.52)', lamps: true };
}

/* ---------- cached gradients (rebuilt only when the ambience phase changes) ---------- */

/** window-glass vertical gradient, cached per phase (same local coords for every window) */
let glassCache: { phase: Ambience['phase']; grad: CanvasGradient } | null = null;
function glassGradient(ctx: CanvasRenderingContext2D, phase: Ambience['phase']): CanvasGradient {
  if (glassCache && glassCache.phase === phase) return glassCache.grad;
  const g = ctx.createLinearGradient(0, 0, 0, WIN_GLASS_H);
  if (phase === 'day') {
    g.addColorStop(0, 'rgba(159,220,255,.85)');
    g.addColorStop(1, 'rgba(234,246,255,.55)');
  } else if (phase === 'morning') { // warmer, with a #ffc478 tinge
    g.addColorStop(0, 'rgba(255,196,120,.80)');
    g.addColorStop(.45, 'rgba(255,224,168,.60)');
    g.addColorStop(1, 'rgba(234,246,255,.50)');
  } else { // evening / night: dark glass + one bright interior band
    g.addColorStop(0, 'rgba(24,44,86,.90)');
    g.addColorStop(.32, 'rgba(132,176,255,.60)');
    g.addColorStop(.42, 'rgba(20,40,80,.90)');
    g.addColorStop(1, 'rgba(8,14,40,.95)');
  }
  glassCache = { phase, grad: g };
  return g;
}

/** AO floor-shadow gradients: 4 fixed inward directions, cached once */
const AO_DIRS: [number, number][] = [[12.5, 6.3], [-12.5, 6.3], [-12.5, -6.3], [12.5, -6.3]];
let aoCache: (CanvasGradient | null)[] | null = null;
function aoGradient(ctx: CanvasRenderingContext2D, i: number): CanvasGradient {
  if (!aoCache) aoCache = [null, null, null, null];
  if (!aoCache[i]) {
    const g = ctx.createLinearGradient(0, 0, AO_DIRS[i][0], AO_DIRS[i][1]);
    g.addColorStop(0, 'rgba(0,0,0,.20)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    aoCache[i] = g;
  }
  return aoCache[i];
}

/** window glow positions (world coords), collected per frame for the night lamp pass */
const winGlows: { x: number; y: number }[] = [];

/** night-lamp gradients — cached per type + ambience phase + quantized zoom
 *  (در فضای محلیِ translate رسم می‌شوند تا یک گرادیان برای همهٔ لامپ‌ها کار کند) */
const radialCache = new Map<string, CanvasGradient>();
function radialLamp(ctx: CanvasRenderingContext2D, kind: 'lamp' | 'monitor' | 'window', phase: string, scale: number): CanvasGradient {
  const key = `${kind}|${phase}|${Math.round(scale * 20)}`;
  let g = radialCache.get(key);
  if (!g) {
    const r = (kind === 'lamp' ? 60 : kind === 'monitor' ? 46 : 44) * scale;
    g = ctx.createRadialGradient(0, 0, 2, 0, 0, r);
    const stops: Record<'lamp' | 'monitor' | 'window', [string, string]> = {
      lamp: ['rgba(255,190,110,.34)', 'rgba(255,190,110,0)'],
      monitor: ['rgba(150,205,255,.26)', 'rgba(150,205,255,0)'],
      window: ['rgba(110,170,255,.22)', 'rgba(110,170,255,0)'],
    };
    g.addColorStop(0, stops[kind][0]);
    g.addColorStop(1, stops[kind][1]);
    radialCache.set(key, g);
  }
  return g;
}

/* ---------- drawing ---------- */

function tilePath(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx + TILE_W / 2, sy + TILE_H / 2);
  ctx.lineTo(sx, sy + TILE_H);
  ctx.lineTo(sx - TILE_W / 2, sy + TILE_H / 2);
  ctx.closePath();
}

/** ambient-occlusion bands where a floor tile touches a wall (14px depth) */
function floorAO(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const p = isoOf(x, y);
  const sx = p.x, sy = p.y;
  const hw = TILE_W / 2, hh = TILE_H / 2;
  const N = [sx, sy], E = [sx + hw, sy + hh], S = [sx, sy + TILE_H], W = [sx - hw, sy + hh];
  const band = (a: number[], b: number[], di: number): void => {
    const [dx, dy] = AO_DIRS[di];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    ctx.save();
    ctx.translate(mid[0], mid[1]);
    ctx.beginPath();
    ctx.moveTo(a[0] - mid[0], a[1] - mid[1]);
    ctx.lineTo(b[0] - mid[0], b[1] - mid[1]);
    ctx.lineTo(b[0] - mid[0] + dx, b[1] - mid[1] + dy);
    ctx.lineTo(a[0] - mid[0] + dx, a[1] - mid[1] + dy);
    ctx.closePath();
    ctx.fillStyle = aoGradient(ctx, di);
    ctx.fill();
    ctx.restore();
  };
  if (MAP[y - 1]?.[x] === 1) band(N, E, 1); // wall up-right: shared edge N–E
  if (MAP[y + 1]?.[x] === 1) band(W, S, 3); // wall down-left: shared edge W–S
  if (MAP[y]?.[x - 1] === 1) band(N, W, 0); // wall up-left: shared edge N–W
  if (MAP[y]?.[x + 1] === 1) band(E, S, 2); // wall down-right: shared edge E–S
}

/** sky-light window inset into a wall tile's exposed right face */
function drawWindow(ctx: CanvasRenderingContext2D, sx: number, sy: number, phase: Ambience['phase']): void {
  const topY = sy + TILE_H - WALL_H;
  const faceLen = Math.hypot(TILE_W / 2, TILE_H / 2);
  const u0 = WIN_INSET / faceLen, u1 = 1 - u0;
  const pt = (u: number, v: number): [number, number] =>
    [sx + (TILE_W / 2) * u, topY - (TILE_H / 2) * u + v];
  const A = pt(u0, WIN_INSET), B = pt(u1, WIN_INSET);
  const C = pt(u1, WIN_INSET + WIN_GLASS_H), D = pt(u0, WIN_INSET + WIN_GLASS_H);
  // gradient lives in local space (translated to the glass's top-left corner),
  // so one cached gradient serves every window
  ctx.save();
  ctx.translate(A[0], A[1]);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(B[0] - A[0], B[1] - A[1]);
  ctx.lineTo(C[0] - A[0], C[1] - A[1]);
  ctx.lineTo(0, WIN_GLASS_H);
  ctx.closePath();
  ctx.fillStyle = glassGradient(ctx, phase);
  ctx.fill();
  ctx.strokeStyle = '#1a2646';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
  winGlows.push({ x: sx + (TILE_W / 2) * .5, y: topY - (TILE_H / 2) * .5 + WIN_INSET + WIN_GLASS_H * .6 });
}

/** extruded wall tile: left/right faces (edge-dependent) + top cap + edge line */
function drawWall(ctx: CanvasRenderingContext2D, x: number, y: number, phase: Ambience['phase']): void {
  const p = isoOf(x, y);
  const sx = p.x, sy = p.y;
  const hw = TILE_W / 2, hh = TILE_H / 2;
  const W = [sx - hw, sy + hh], E = [sx + hw, sy + hh], S = [sx, sy + TILE_H];
  const leftExposed = MAP[y + 1]?.[x] !== 1;
  const rightExposed = MAP[y]?.[x + 1] !== 1;
  if (leftExposed) { // W→S→S′→W′
    ctx.beginPath();
    ctx.moveTo(W[0], W[1]); ctx.lineTo(S[0], S[1]);
    ctx.lineTo(S[0], S[1] - WALL_H); ctx.lineTo(W[0], W[1] - WALL_H);
    ctx.closePath();
    ctx.fillStyle = shade(WALL, .68); ctx.fill();
  }
  if (rightExposed) { // S→E→E′→S′
    ctx.beginPath();
    ctx.moveTo(S[0], S[1]); ctx.lineTo(E[0], E[1]);
    ctx.lineTo(E[0], E[1] - WALL_H); ctx.lineTo(S[0], S[1] - WALL_H);
    ctx.closePath();
    ctx.fillStyle = shade(WALL, .88); ctx.fill();
    if ((x * 5 + y * 7) % 3 === 0) drawWindow(ctx, sx, sy, phase);
  }
  // top cap: the tile diamond raised by WALL_H
  ctx.beginPath();
  ctx.moveTo(sx, sy - WALL_H);
  ctx.lineTo(sx + hw, sy + hh - WALL_H);
  ctx.lineTo(sx, sy + TILE_H - WALL_H);
  ctx.lineTo(sx - hw, sy + hh - WALL_H);
  ctx.closePath();
  ctx.fillStyle = WALL_TOP; ctx.fill();
  // thin vertical edge line on the exposed front corner for readability
  if (leftExposed || rightExposed) {
    ctx.strokeStyle = 'rgba(0,0,0,.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(S[0], S[1]); ctx.lineTo(S[0], S[1] - WALL_H);
    ctx.stroke();
  }
}

/** generic iso box: diamond top plate extruded h px, with shaded side faces */
function extrudedDiamond(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, rx: number, ry: number, h: number,
  top: string, faceBase: string, fLeft: number, fRight: number,
): void {
  const t = cy - h;
  // left face (W→S edge, extruded down)
  ctx.beginPath();
  ctx.moveTo(cx - rx, t); ctx.lineTo(cx, t + ry);
  ctx.lineTo(cx, t + ry + h); ctx.lineTo(cx - rx, t + h);
  ctx.closePath();
  ctx.fillStyle = shade(faceBase, fLeft); ctx.fill();
  // right face (S→E edge, extruded down)
  ctx.beginPath();
  ctx.moveTo(cx, t + ry); ctx.lineTo(cx + rx, t);
  ctx.lineTo(cx + rx, t + h); ctx.lineTo(cx, t + ry + h);
  ctx.closePath();
  ctx.fillStyle = shade(faceBase, fRight); ctx.fill();
  // top plate
  ctx.beginPath();
  ctx.moveTo(cx, t - ry); ctx.lineTo(cx + rx, t);
  ctx.lineTo(cx, t + ry); ctx.lineTo(cx - rx, t);
  ctx.closePath();
  ctx.fillStyle = top; ctx.fill();
}

/** monitor: trapezoid stand + extruded body + 2px-skewed screen quad */
function drawMonitor(ctx: CanvasRenderingContext2D, mx: number, my: number, inUse: boolean, fx: number, fy: number): void {
  const topY = my - 20;
  // stand
  ctx.fillStyle = '#22304a';
  ctx.beginPath();
  ctx.moveTo(mx - 7, my); ctx.lineTo(mx + 7, my);
  ctx.lineTo(mx + 3, my - 7); ctx.lineTo(mx - 3, my - 7);
  ctx.closePath(); ctx.fill();
  // body extruded 4px (back slab + front slab)
  ctx.fillStyle = '#16233c';
  ctx.beginPath(); ctx.roundRect(mx - 12, topY - 4, 24, 16, 3); ctx.fill();
  ctx.fillStyle = '#0d1526';
  ctx.beginPath(); ctx.roundRect(mx - 12, topY, 24, 16, 3); ctx.fill();
  // screen quad with a 2px skew on the bottom edge
  ctx.beginPath();
  ctx.moveTo(mx - 10, topY + 2);
  ctx.lineTo(mx + 10, topY + 2);
  ctx.lineTo(mx + 8, topY + 13);
  ctx.lineTo(mx - 12, topY + 13);
  ctx.closePath();
  ctx.fillStyle = inUse ? '#7cd0ff' : '#26456b'; ctx.fill();
  if (inUse) { // typing glow flicker
    ctx.globalAlpha = .25 + Math.random() * .2;
    ctx.fillStyle = '#9fdcff';
    ctx.fill();
    ctx.globalAlpha = 1;
    // very low-alpha screen-glow on the floor in front of the desk
    ctx.fillStyle = 'rgba(157,220,255,.08)';
    ctx.beginPath(); ctx.roundRect(fx - 22, fy - 2, 44, 14, 6); ctx.fill();
  }
}

/** desk: diamond wood top extruded 8px + shaded faces + front leg + monitor */
function drawDesk(ctx: CanvasRenderingContext2D, spot: (typeof SPOTS)[number], inUse: boolean): void {
  const p = isoOf(spot.x, spot.y);
  const cx = p.x, cy = p.y + TILE_H / 2;
  // front leg line (drawn first, under the body)
  ctx.strokeStyle = '#6e4526'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx, cy + 11); ctx.lineTo(cx, cy + 17); ctx.stroke();
  // top plate: #a06c40, faces shaded ×0.72 / ×0.88
  extrudedDiamond(ctx, cx, cy, 27, 13, 8, '#a06c40', '#a06c40', .72, .88);
  drawMonitor(ctx, cx + 2, cy - 8, inUse, cx, cy + 13);
}

/** chair on the desk's stand tile: short extruded base + vertical backrest */
function drawChair(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const p = isoOf(x, y);
  const cx = p.x, cy = p.y + TILE_H / 2;
  extrudedDiamond(ctx, cx, cy, 10, 5, 10, '#3a4c73', '#2c3b5c', .68, .88);
  // backrest 18×22 rising behind the seat (away from the desk)
  const bx = cx - 17, by = cy - 10 - 22;
  ctx.fillStyle = '#2c3b5c';
  ctx.beginPath(); ctx.roundRect(bx, by, 18, 22, 5); ctx.fill();
  // surface shading on the back side
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath(); ctx.roundRect(bx, by, 8, 22, 5); ctx.fill();
}

/** potted plant: trapezoid pot extruded 6px + three swaying leaf layers */
function drawPlant(ctx: CanvasRenderingContext2D, x: number, y: number, now: number): void {
  const p = isoOf(x, y);
  const cx = p.x, cy = p.y + TILE_H / 2;
  extrudedDiamond(ctx, cx, cy, 11, 6, 6, '#a06c40', '#8a5a33', .68, .88);
  const sway = Math.sin(now / 1400) * 1.5;
  ctx.fillStyle = '#3f8f5f';
  ctx.beginPath(); ctx.ellipse(cx + sway * .6, cy - 16, 12, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#47a067';
  ctx.beginPath(); ctx.ellipse(cx + sway, cy - 24, 9.5, 6.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#4fae72';
  ctx.beginPath(); ctx.ellipse(cx + sway * 1.3, cy - 31, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
}

/** coffee machine: 30px extruded box + phosphor orange button (+ night flash) */
function drawCoffee(ctx: CanvasRenderingContext2D, spot: (typeof SPOTS)[number], lamps: boolean, now: number): void {
  const p = isoOf(spot.x, spot.y);
  const cx = p.x, cy = p.y + TILE_H / 2;
  extrudedDiamond(ctx, cx, cy, 14, 8, 30, '#2c3b58', '#233149', .68, .88);
  ctx.fillStyle = '#f5b56a';
  ctx.beginPath(); ctx.arc(cx + 9, cy - 20, 2.5, 0, Math.PI * 2); ctx.fill();
  if (lamps) { // tiny night light flash
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = .35 + .3 * Math.sin(now / 260);
    ctx.fillStyle = '#ffb066';
    ctx.beginPath(); ctx.arc(cx + 9, cy - 20, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

/** meeting table: oval top with a darker rim + base (carpet stays on the floor pass) */
function drawMeeting(ctx: CanvasRenderingContext2D, spot: (typeof SPOTS)[number]): void {
  const p = isoOf(spot.x, spot.y);
  const cy = p.y + 8;
  ctx.fillStyle = '#253d5f'; // base
  ctx.beginPath(); ctx.ellipse(p.x, cy + 6, 40, 20, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3f6aa3'; // top
  ctx.beginPath(); ctx.ellipse(p.x, cy, 40, 20, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(10,20,40,.55)'; ctx.lineWidth = 2; // rim shadow
  ctx.stroke();
}

/** reception counter: extruded box + SESEMI sign on its right face */
function drawReception(ctx: CanvasRenderingContext2D, spot: (typeof SPOTS)[number]): void {
  const p = isoOf(spot.x, spot.y);
  const cx = p.x, cy = p.y + TILE_H / 2;
  extrudedDiamond(ctx, cx, cy, 22, 11, 12, '#3d5c8f', '#31517c', .68, .88);
  ctx.save();
  ctx.translate(cx + 11, cy - 6.5); // midpoint of the right face's top edge
  ctx.rotate(-Math.atan2(11, 22)); // lie along the face
  ctx.fillStyle = '#48b9ff';
  ctx.font = 'bold 9px Vazirmatn, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SESEMI', 0, 3);
  ctx.restore();
}

function drawAgent(ctx: CanvasRenderingContext2D, agent: Agent, cam: Camera, now: number): void {
  // interpolate between tiles while walking
  const a = isoOf(agent.from.x, agent.from.y);
  const b = isoOf(agent.to.x, agent.to.y);
  const t = agent.state === 'walking' ? agent.moveT : 1;
  let px = a.x + (b.x - a.x) * t;
  let py = a.y + (b.y - a.y) * t;
  let bob = agent.state === 'walking' ? Math.abs(Math.sin(now / 130)) * 5 : Math.sin(now / 900) * 1.6;
  // فقط کارِ پشت میز روی workAnchor می‌نشیند؛ ایجنت‌های meeting در کاشی stand
  // خودشان می‌مانند تا روی هم نیفتند (هر ایجنت کاشی مخصوص خودش را گرفته است)
  const seated = agent.state === 'working' && agent.currentSpot;
  if (seated) {
    const spot = SPOTS.find(s => s.id === agent.currentSpot);
    if (spot) { const w = workAnchor(spot); const wa = isoOf(w.x, w.y); px = wa.x; py = wa.y; bob = Math.sin(now / 500) * 1.2; }
  }
  const x = px * cam.scale + cam.panX;
  const y = py * cam.scale + cam.panY;

  cameraCtl.hits.push({ id: agent.id, x, feetY: y, scale: cam.scale });

  // work particles rise from the monitor while the real AI is running —
  // مختصات جهانی (px/py) تا با pan/zoom/دنبال‌کردن روی مانیتور بمانند
  if (agent.state === 'working' && cameraCtl.particles.length < 90 && Math.random() < .35) {
    cameraCtl.particles.push({
      x: px + (agent.facing === 1 ? -14 : 14), y: py - 30,
      vx: (Math.random() - .5) * .35, vy: -(.5 + Math.random() * .5), life: 1,
      hue: Math.random() < .5 ? '#9fdcff' : ACCENT,
    });
  }

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
  // selected ring
  if (cameraCtl.followId === agent.id) {
    ctx.strokeStyle = ACCENT; ctx.lineWidth = 2 * s;
    ctx.beginPath(); ctx.ellipse(x, y - 4 * s, 22 * s, 11 * s, 0, 0, Math.PI * 2); ctx.stroke();
  }
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

/* ---------- office growth: the team physically builds the campus ---------- */

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

function drawGrowthBuilding(ctx: CanvasRenderingContext2D, i: number, scale: number, phase: Ambience['phase']): void {
  const b = GROWTH_BUILDINGS[i];
  const p = isoOf(b.wx, b.wy);
  const rx = (TILE_W / 2) * .92 * scale;
  const ry = (TILE_H / 2) * .92 * scale;
  extrudedDiamond(ctx, p.x, p.y, rx, ry, b.h * scale, shade(b.top, phase === 'night' ? .55 : 1), b.face, phase === 'night' ? .6 : .92, phase === 'night' ? .45 : .78);
  if (scale >= .98) {
    ctx.font = '9px Vazirmatn, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(159,216,255,.75)';
    ctx.fillText(GROWTH_NAMES[i], p.x, p.y + 14);
  }
}

/* ---------- depth-sorted draw queue ---------- */

interface QItem { sum: number; order: number; world: boolean; fn: () => void }

/** per-frame params the static queue's closures read (refreshed every render) */
const frameState = { phase: 'day' as Ambience['phase'], lamps: false, now: 0 };
/** spots currently in use (desk monitors) — refreshed every render */
const usedSpots = new Set<string>();
/** static queue items (walls + furniture + plants) — built once per page load */
let staticQueue: QItem[] | null = null;
/** reusable combined render queue (static items + fresh agent items per frame) */
const depthQueue: QItem[] = [];

function depthCompare(a: QItem, b: QItem): number { return a.sum - b.sum || a.order - b.order; }

function buildStaticQueue(ctx: CanvasRenderingContext2D): QItem[] {
  const q: QItem[] = [];
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (MAP[y][x] !== 1) continue;
      q.push({ sum: x + y, order: 0, world: true, fn: () => drawWall(ctx, x, y, frameState.phase) });
    }
  }
  for (const spot of SPOTS) {
    if (spot.id.startsWith('desk')) {
      q.push({ sum: spot.x + spot.y, order: 0, world: true, fn: () => drawDesk(ctx, spot, usedSpots.has(spot.id)) });
      const st = spotStandTile(spot);
      q.push({ sum: st.x + st.y, order: 0, world: true, fn: () => drawChair(ctx, st.x, st.y) });
    } else if (spot.id === 'meeting') {
      q.push({ sum: spot.x + spot.y, order: 0, world: true, fn: () => drawMeeting(ctx, spot) });
    } else if (spot.id === 'coffee') {
      q.push({ sum: spot.x + spot.y, order: 0, world: true, fn: () => drawCoffee(ctx, spot, frameState.lamps, frameState.now) });
    } else if (spot.id === 'reception') {
      q.push({ sum: spot.x + spot.y, order: 0, world: true, fn: () => drawReception(ctx, spot) });
    }
  }
  for (const [px, py] of PLANT_TILES) {
    q.push({ sum: px + py, order: 0, world: true, fn: () => drawPlant(ctx, px, py, frameState.now) });
  }
  return q;
}

export function render(canvas: HTMLCanvasElement, agents: Agent[], now: number): void {
  const ctx = canvas.getContext('2d')!;
  const cam = cameraCtl.cam;
  const amb = ambienceNow();

  // smooth follow of the selected agent
  if (cameraCtl.followId) {
    const agent = agents.find(a => a.id === cameraCtl.followId);
    if (agent) {
      const p = isoOf(agent.from.x + (agent.to.x - agent.from.x) * (agent.state === 'walking' ? agent.moveT : 1),
        agent.from.y + (agent.to.y - agent.from.y) * (agent.state === 'walking' ? agent.moveT : 1));
      const targetX = cameraCtl.cssW / 2 - p.x * cam.scale;
      const targetY = cameraCtl.cssH / 2 - p.y * cam.scale + 40;
      cam.panX += (targetX - cam.panX) * .1;
      cam.panY += (targetY - cam.panY) * .1;
    }
  }

  ctx.setTransform(cameraCtl.dpr, 0, 0, cameraCtl.dpr, 0, 0);
  ctx.clearRect(0, 0, cameraCtl.cssW, cameraCtl.cssH);
  cameraCtl.hits.length = 0;
  winGlows.length = 0;

  let inWorld = false;
  const setSpace = (world: boolean): void => {
    if (inWorld === world) return;
    inWorld = world;
    ctx.setTransform(cameraCtl.dpr, 0, 0, cameraCtl.dpr, 0, 0);
    if (world) { ctx.translate(cam.panX, cam.panY); ctx.scale(cam.scale, cam.scale); }
  };

  /* floor pass (always behind everything): tiles + AO + grid */
  setSpace(true);
  for (let sum = 0; sum <= MAP_W + MAP_H - 2; sum++) {
    for (let x = 0; x <= sum; x++) {
      const y = sum - x;
      if (x >= MAP_W || y >= MAP_H) continue;
      if (MAP[y][x] === 1) continue; // walls go through the depth-sorted queue
      const p = isoOf(x, y);
      tilePath(ctx, p.x, p.y);
      ctx.fillStyle = (x + y) % 2 === 0 ? FLOOR_A : FLOOR_B; ctx.fill();
      floorAO(ctx, x, y);
      ctx.strokeStyle = 'rgba(83,185,251,.06)'; ctx.lineWidth = 1; ctx.stroke();
    }
  }

  // meeting-room carpet
  const mp = isoOf(9, 3);
  ctx.save(); ctx.globalAlpha = .18; ctx.fillStyle = ACCENT;
  ctx.beginPath(); ctx.ellipse(mp.x, mp.y + 14, 58, 30, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  /* build the depth-sorted draw queue: walls + furniture (world space),
     agents (screen space — drawAgent handles pan/scale itself).
     Static items are built once and read frameState/usedSpots; only the agent
     items and their per-frame params refresh each render. */
  usedSpots.clear();
  for (const a of agents) if (a.currentSpot) usedSpots.add(a.currentSpot);
  frameState.phase = amb.phase;
  frameState.lamps = amb.lamps;
  frameState.now = now;
  if (!staticQueue) staticQueue = buildStaticQueue(ctx);
  depthQueue.length = 0;
  for (const item of staticQueue) depthQueue.push(item);
  for (const agent of agents) {
    const t = agent.state === 'walking' ? agent.moveT : 1;
    // جمع اعشاری مستقیم — گردکردن ایجنتِ نیم‌کاشی را به ردیف دیوار اشتباه می‌برد
    const sum = agent.from.x + (agent.to.x - agent.from.x) * t + agent.from.y + (agent.to.y - agent.from.y) * t;
    depthQueue.push({ sum, order: 1, world: false, fn: () => drawAgent(ctx, agent, cam, now) });
  }
  // ساختمان‌های محوطه (جلوی تمام کاشی‌ها هستند — جمع > حداکثر نقشه) با انیمیشن ظاهرشدن
  const growth = growthLevel(now);
  if (growth !== growthSeen) { growthBornAt = now; growthSeen = growth; }
  for (let i = 0; i < Math.min(growth, GROWTH_BUILDINGS.length); i++) {
    const isNewest = i === growth - 1;
    const age = Math.min(1, (now - growthBornAt) / 900);
    const e = isNewest ? 1 + 2.2 * Math.pow(age - 1, 3) + 1.2 * Math.pow(age - 1, 2) : 1; // easeOutBack
    const gi = i;
    depthQueue.push({ sum: GROWTH_BUILDINGS[gi].wx + GROWTH_BUILDINGS[gi].wy, order: 2, world: true, fn: () => drawGrowthBuilding(ctx, gi, Math.max(.01, e), amb.phase) });
  }
  // painter order: ascending (sum, order) — agents at the same tile sum draw
  // after that tile's furniture, and seated agents line up with their desk
  depthQueue.sort(depthCompare);
  for (const item of depthQueue) {
    setSpace(item.world);
    item.fn();
  }
  setSpace(false);

  // work particles (مختصات جهانی → اینجا به screen تبدیل می‌شوند تا با pan/zoom روی مانیتور بمانند)
  ctx.save();
  for (const p of cameraCtl.particles) {
    const sx = p.x * cam.scale + cam.panX;
    const sy = p.y * cam.scale + cam.panY;
    ctx.globalAlpha = Math.max(0, p.life) * .8;
    ctx.fillStyle = p.hue;
    ctx.beginPath(); ctx.roundRect(sx, sy, 3, 3, 1.5); ctx.fill();
  }
  ctx.restore();

  // day-night ambience: tint + warm desk lamps at evening/night
  if (amb.tint !== 'transparent') {
    ctx.fillStyle = amb.tint;
    ctx.fillRect(0, 0, cameraCtl.cssW, cameraCtl.cssH);
  }
  if (amb.lamps) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // warm desk lamps — گرادیان کش‌شده در فضای محلیِ translate
    for (const spot of SPOTS) {
      if (!spot.id.startsWith('desk')) continue;
      const p = isoOf(spot.x, spot.y);
      const gx = p.x * cam.scale + cam.panX;
      const gy = p.y * cam.scale + cam.panY - 14 * cam.scale;
      ctx.save();
      ctx.translate(gx, gy);
      ctx.fillStyle = radialLamp(ctx, 'lamp', amb.phase, cam.scale);
      ctx.beginPath(); ctx.arc(0, 0, 60 * cam.scale, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // cold monitor glow for in-use desks (evening/night)
    for (const spot of SPOTS) {
      if (!spot.id.startsWith('desk') || !usedSpots.has(spot.id)) continue;
      const p = isoOf(spot.x, spot.y);
      const gx = (p.x + 2) * cam.scale + cam.panX;
      const gy = (p.y + TILE_H / 2 - 20) * cam.scale + cam.panY;
      ctx.save();
      ctx.translate(gx, gy);
      ctx.fillStyle = radialLamp(ctx, 'monitor', amb.phase, cam.scale);
      ctx.beginPath(); ctx.arc(0, 0, 46 * cam.scale, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // sky-light window glow (evening/night)
    for (const wgl of winGlows) {
      const gx = wgl.x * cam.scale + cam.panX;
      const gy = wgl.y * cam.scale + cam.panY;
      ctx.save();
      ctx.translate(gx, gy);
      ctx.fillStyle = radialLamp(ctx, 'window', amb.phase, cam.scale);
      ctx.beginPath(); ctx.arc(0, 0, 44 * cam.scale, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
}

/** advance particles + prune dead ones (called from the same rAF loop) */
export function stepEffects(dt: number): void {
  for (const p of cameraCtl.particles) {
    p.x += p.vx * dt * 60; p.y += p.vy * dt * 60; p.life -= dt * .9;
  }
  cameraCtl.particles = cameraCtl.particles.filter(p => p.life > 0);
}
