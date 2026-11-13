/**
 * Office world: an isometric tile grid, furniture spots, and A* pathfinding.
 * Tiles: 0 = floor, 1 = wall/blocked. Spots anchor behaviors to furniture.
 */

export type Vec2 = { x: number; y: number };

export const MAP_W = 12;
export const MAP_H = 12;

/** 12×12 open floor with a wall ring; interior walls carved below. */
export const MAP: number[][] = (() => {
  const g: number[][] = [];
  for (let y = 0; y < MAP_H; y++) {
    const row: number[] = [];
    for (let x = 0; x < MAP_W; x++) {
      const edge = x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1;
      row.push(edge ? 1 : 0);
    }
    g.push(row);
  }
  // meeting-room walls (top-right room, 2 tiles thick opening on the left)
  for (let x = 8; x <= 10; x++) { g[1][x] = 1; g[5][x] = 1; }
  g[2][8] = 1; g[3][8] = 1; g[4][8] = 1;
  // reception counter (bottom-left)
  g[9][2] = 1; g[10][2] = 1;
  // furniture tiles are solid for pathfinding (2 = blocked but still rendered as floor):
  // desks, coffee machine, meeting table, reception counter — A* نباید از روی مبلمان بگذرد
  for (const [fx, fy] of [[2, 2], [5, 2], [2, 5], [5, 5], [6, 9], [9, 3], [3, 9]] as const) g[fy][fx] = 2;
  return g;
})();

export interface Spot { id: string; x: number; y: number; facing: 'left' | 'right'; label: string }

/** Furniture anchors — agents walk to the adjacent free tile and "use" the spot. */
export const SPOTS: Spot[] = [
  { id: 'desk-1', x: 2, y: 2, facing: 'right', label: 'میز کار ۱' },
  { id: 'desk-2', x: 5, y: 2, facing: 'right', label: 'میز کار ۲' },
  { id: 'desk-3', x: 2, y: 5, facing: 'right', label: 'میز کار ۳' },
  { id: 'desk-4', x: 5, y: 5, facing: 'right', label: 'میز کار ۴' },
  { id: 'meeting', x: 9, y: 3, facing: 'left', label: 'اتاق جلسه' },
  { id: 'coffee', x: 6, y: 9, facing: 'right', label: 'ماشین قهوه' },
  { id: 'reception', x: 3, y: 9, facing: 'left', label: 'پذیرش' },
];

/** Tiles adjacent to a spot where the agent stands to use it. */
export function spotStandTile(spot: Spot): Vec2 {
  return spot.facing === 'right' ? { x: spot.x - 1, y: spot.y } : { x: spot.x + 1, y: spot.y };
}

const walkable = (x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && MAP[y][x] === 0;

/** Classic A* on the tile grid (4-directional). Returns tiles from AFTER the
 *  start up to and including the goal, or null when unreachable. */
export function findPath(start: Vec2, goal: Vec2): Vec2[] | null {
  if (!walkable(goal.x, goal.y)) return null;
  const key = (p: Vec2) => p.y * MAP_W + p.x;
  const open: { p: Vec2; f: number }[] = [{ p: start, f: 0 }];
  const came = new Map<number, number>();
  const gScore = new Map<number, number>([[key(start), 0]]);
  const h = (p: Vec2) => Math.abs(p.x - goal.x) + Math.abs(p.y - goal.y);
  while (open.length) {
    open.sort((a, b) => a.f - b.f);
    const current = open.shift()!;
    if (current.p.x === goal.x && current.p.y === goal.y) {
      const path: Vec2[] = [];
      let k = key(goal);
      while (k !== key(start)) {
        path.push({ x: k % MAP_W, y: Math.floor(k / MAP_W) });
        k = came.get(k)!;
      }
      return path.reverse();
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = current.p.x + dx, ny = current.p.y + dy;
      if (!walkable(nx, ny)) continue;
      const nk = ny * MAP_W + nx;
      const tentative = (gScore.get(key(current.p)) ?? Infinity) + 1;
      if (tentative < (gScore.get(nk) ?? Infinity)) {
        came.set(nk, key(current.p));
        gScore.set(nk, tentative);
        open.push({ p: { x: nx, y: ny }, f: tentative + h({ x: nx, y: ny }) });
      }
    }
  }
  return null;
}

/** Nearest walkable tile to a spot (the stand tile might be occupied). */
export function spotApproach(spot: Spot, occupied: Set<number>): Vec2 | null {
  const preferred = spotStandTile(spot);
  if (walkable(preferred.x, preferred.y) && !occupied.has(preferred.y * MAP_W + preferred.x)) return preferred;
  for (let radius = 1; radius <= 3; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = spot.x + dx, y = spot.y + dy;
        if (walkable(x, y) && !occupied.has(y * MAP_W + x)) return { x, y };
      }
    }
  }
  return null;
}

export const spotById = (id: string): Spot | undefined => SPOTS.find(s => s.id === id);
