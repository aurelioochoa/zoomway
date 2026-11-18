// Every number the rules are built from (design §7a, §8, §9). The renderer reads the mesh
// sizes from here too, so a hitbox can never drift from the thing it stands for.

/** The fixed simulation step: 60 Hz whatever the display does (§12). */
export const STEP = 1 / 60;

/** Lanes are 0 (left), 1 (middle), 2 (right). */
export type Lane = 0 | 1 | 2;
export const LANE_W = 1.5;
export const laneX = (lane: number): number => (lane - 1) * LANE_W;

/** §7a: a lane change is a 0.14 s ease-out. */
export const LANE_TIME = 0.14;
/** §7a: 0.6 s airtime, 1.6 m apex. */
export const JUMP_TIME = 0.6;
export const JUMP_APEX = 1.6;
/** §9: a springboard is an optional launch into a high fruit arc. */
export const SPRING_TIME = 1.1;
export const SPRING_APEX = 3.4;
/** A belly-slide lasts this long; pressing ↓ again restarts it. */
export const SLIDE_TIME = 0.75;
/** ↓ in mid-air: drop straight down at this speed, then slide (§7a). */
export const DROP_SPEED = 14;
/** §7a: a jump pressed up to 100 ms before landing fires on landing. */
export const JUMP_BUFFER = 0.1;
/** A side scrape: the wobble the capybara keeps while it bounces back (§8). */
export const SCRAPE_TIME = 0.45;
/** After a swim ring pops, the capybara wobbles on through whatever it hit. */
export const RING_GRACE = 1.0;
/** §9 power-ups. */
export const BUBBLE_TIME = 4;
export const BUBBLE_HEIGHT = 2.4;
export const PINWHEEL_TIME = 8;
/** How far ahead the pinwheel pulls tangerines in from every lane. */
export const PINWHEEL_REACH = 8;
/** §8: the camera holds on the obstacle that was hit before the results card. */
export const BONK_HOLD = 0.9;
/** §8: a 0.3 s anti-mash guard before a restart is accepted. */
export const RESTART_GUARD = 0.3;
/** Before the first input the capybara cruises slowly (§3). */
export const CRUISE_SPEED = 4;
/** §7a: the look-ahead is a fixed ~90 m — never touched by a quality tier (§12). */
export const LOOK_AHEAD = 90;

/** §7a: hitboxes are 15 % smaller than the meshes. */
export const SHRINK = 0.85;

export interface Box {
  /** Width across the boardwalk. */
  w: number;
  /** Depth along the boardwalk. */
  d: number;
  y0: number;
  y1: number;
}

/**
 * Mesh sizes, in metres. Each kind keeps its silhouette and height in every zone (§9):
 * tall (blocker), knee-high (hurdle), head-high with air beneath (banner).
 */
export const MESH = {
  blocker: { w: 1.3, d: 1.1, y0: 0, y1: 2.3 },
  wall: { w: 1.3, d: 5.5, y0: 0, y1: 2.3 },
  hurdle: { w: 1.35, d: 0.6, y0: 0, y1: 0.7 },
  banner: { w: 1.5, d: 0.25, y0: 0.75, y1: 1.9 },
  spring: { w: 1.1, d: 1.6, y0: 0, y1: 0.18 },
} as const satisfies Record<string, Box>;

export const PLAYER_MESH = { w: 0.8, len: 1.0, stand: 1.25, slide: 0.55 } as const;

export interface HitBox {
  hw: number;
  hd: number;
  y0: number;
  y1: number;
}

/** Shrink a mesh box by SHRINK about its own centre, in every dimension. */
export function hitBox(m: Box): HitBox {
  const cy = (m.y0 + m.y1) / 2;
  const hy = ((m.y1 - m.y0) / 2) * SHRINK;
  return { hw: (m.w / 2) * SHRINK, hd: (m.d / 2) * SHRINK, y0: cy - hy, y1: cy + hy };
}

export const PLAYER_HW = (PLAYER_MESH.w / 2) * SHRINK;
export const PLAYER_HD = (PLAYER_MESH.len / 2) * SHRINK;
/** Player hitbox bottom/top above the feet, standing and sliding. */
const standHalf = (PLAYER_MESH.stand / 2) * SHRINK;
const slideHalf = (PLAYER_MESH.slide / 2) * SHRINK;
export const STAND_Y0 = PLAYER_MESH.stand / 2 - standHalf;
export const STAND_Y1 = PLAYER_MESH.stand / 2 + standHalf;
export const SLIDE_Y0 = PLAYER_MESH.slide / 2 - slideHalf;
export const SLIDE_Y1 = PLAYER_MESH.slide / 2 + slideHalf;
/** Where a tangerine floats so a standing / sliding capybara runs straight through it. */
export const FRUIT_Y = (STAND_Y0 + STAND_Y1) / 2;
export const FRUIT_LOW_Y = (SLIDE_Y0 + SLIDE_Y1) / 2 + 0.03;
export const FRUIT_SPACING = 2.4;
export const POWER_Y = 0.95;

/** Lateness forgiveness (§8: "never by being slightly late"). */
export const GRAZE_HURDLE = 0.3;
export const GRAZE_BANNER = 0.25;

/**
 * The shape of a jump, 0 → 1 → 0 over its airtime. A touch flatter than a parabola at the
 * top, so the capybara floats there (§7a).
 */
export function arc(u: number): number {
  if (u <= 0 || u >= 1) return 0;
  const k = Math.abs(2 * u - 1);
  return 1 - Math.pow(k, 2.3);
}
