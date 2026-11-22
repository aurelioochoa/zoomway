// Every number the rules are built from (design §7a, §8, §9, §D). The renderer reads the
// mesh sizes from here too, so a hitbox can never drift from the thing it stands for.

/** The fixed simulation step: 60 Hz whatever the display does (§12). */
export const STEP_SECONDS = 1 / 60;

/** Lanes are 0 (left), 1 (middle), 2 (right). */
export const LANE_WIDTH = 1.5;
export const laneCenter = (lane: number): number => (lane - 1) * LANE_WIDTH;

/** §7a: a lane change is a 0.14 s ease-out. */
export const LANE_CHANGE_SECONDS = 0.14;
/** §7a: 0.6 s airtime, 1.6 m apex. */
export const JUMP_SECONDS = 0.6;
export const JUMP_APEX = 1.6;
/** §9: a springboard is an optional launch into a high fruit arc. */
export const SPRING_SECONDS = 1.1;
export const SPRING_APEX = 3.4;
/** A belly-slide lasts this long; pressing ↓ again restarts it. */
export const SLIDE_SECONDS = 0.75;
/** ↓ in mid-air drops straight down at this speed, then slides (§7a). */
export const DROP_SPEED = 14;
/** §7a: a jump pressed up to 100 ms before landing fires on landing. */
export const JUMP_BUFFER_SECONDS = 0.1;
/** §8: after a side scrape the capybara wobbles back to its lane and nothing is lost. */
export const SCRAPE_SECONDS = 0.45;
/** After a swim ring pops, the capybara wobbles on through whatever it hit. */
export const RING_GRACE_SECONDS = 1;
/** §9 power-ups. */
export const BUBBLE_SECONDS = 4;
export const BUBBLE_HEIGHT = 2.4;
export const BUBBLE_RISE_SECONDS = 0.4;
export const BUBBLE_DESCENT_SECONDS = 0.35;
/** The bubble only pops once this much empty boardwalk lies ahead in its lane. */
export const BUBBLE_LANDING_SECONDS = 1;
export const PINWHEEL_SECONDS = 8;
/** How far ahead the pinwheel blows tangerines in from every lane. */
export const PINWHEEL_REACH = 8;
/** §8: the camera holds on the obstacle that was hit before the results card. */
export const BONK_HOLD_SECONDS = 0.9;
/** §8: a 0.3 s anti-mash guard before a restart is accepted. */
export const RESTART_GUARD_SECONDS = 0.3;
/** Before the first input the capybara cruises slowly and nothing ever arrives (§3). */
export const CRUISE_SPEED = 4;
/** How quickly the skates whoosh up from the cruise to the run's speed. */
export const SPEED_EASE_SECONDS = 0.5;
/** §7a: the look-ahead is a fixed ~90 m, never touched by a quality tier (§12). */
export const LOOK_AHEAD = 90;
/** §8: about 20 s of one-kind rows at the start of every run (180 m at warm-up speed). */
export const WARM_UP_DISTANCE = 180;
export const BUSY_DISTANCE = 600;

/** §5: zones by distance; after Sunset Pier the palettes cycle. */
export const ZONE_STARTS = [0, 600, 1500, 2500] as const;
export const ZONE_CYCLE = 3500;
export function zoneAt(distance: number): number {
  const wrapped = ((distance % ZONE_CYCLE) + ZONE_CYCLE) % ZONE_CYCLE;
  let zone = 0;
  ZONE_STARTS.forEach((start, index) => {
    if (wrapped >= start) zone = index;
  });
  return zone;
}

/**
 * §7a: v = 8 + 10·(1 − e^(−t/90)), capped at 18. §D Gentle caps at 12 with a slower climb.
 * Both start at 8, so every chunk is proven at the same lowest speed.
 */
export function speedAt(runSeconds: number, gentle: boolean): number {
  return gentle
    ? Math.min(12, 8 + 4 * (1 - Math.exp(-runSeconds / 150)))
    : Math.min(18, 8 + 10 * (1 - Math.exp(-runSeconds / 90)));
}

/**
 * §7a: the empty boardwalk between chunks, in seconds. Never below 1.6 s in the warm-up,
 * 0.75 s at the cap; Gentle never below 1.2 s (§D).
 */
export function decisionGapSeconds(speed: number, gentle: boolean): number {
  const fraction = Math.min(1, Math.max(0, (speed - 10) / 8));
  const gap = 1.6 + (0.75 - 1.6) * fraction;
  return gentle ? Math.max(1.2, gap) : gap;
}

/** §7a: hitboxes are 15 % smaller than the meshes. */
export const HITBOX_SCALE = 0.85;

export interface Box {
  width: number;
  depth: number;
  bottom: number;
  top: number;
}

/**
 * Mesh sizes in metres. Each kind keeps its silhouette and height in every zone (§9): tall
 * (blocker), knee-high (hurdle), head-high with air beneath (banner).
 */
export const MESH = {
  blocker: { width: 1.3, depth: 1.1, bottom: 0, top: 2.3 },
  hurdle: { width: 1.4, depth: 0.6, bottom: 0, top: 0.7 },
  banner: { width: 1.5, depth: 0.25, bottom: 0.75, top: 1.9 },
  spring: { width: 1.1, depth: 1.6, bottom: 0, top: 0.18 },
} as const satisfies Record<string, Box>;

export const PLAYER_MESH = { width: 0.8, depth: 1.0, standing: 1.25, sliding: 0.55 } as const;

export interface HitBox {
  halfWidth: number;
  halfDepth: number;
  bottom: number;
  top: number;
}

/** Shrink a mesh box by HITBOX_SCALE about its own centre, in every dimension. */
export function hitBox(mesh: Box): HitBox {
  const middle = (mesh.bottom + mesh.top) / 2;
  const halfHeight = ((mesh.top - mesh.bottom) / 2) * HITBOX_SCALE;
  return {
    halfWidth: (mesh.width / 2) * HITBOX_SCALE,
    halfDepth: (mesh.depth / 2) * HITBOX_SCALE,
    bottom: middle - halfHeight,
    top: middle + halfHeight,
  };
}

export const PLAYER_BOX = {
  standing: hitBox({ width: PLAYER_MESH.width, depth: PLAYER_MESH.depth, bottom: 0, top: PLAYER_MESH.standing }),
  sliding: hitBox({ width: PLAYER_MESH.width, depth: PLAYER_MESH.depth, bottom: 0, top: PLAYER_MESH.sliding }),
};

/** Tangerines float where a standing (or sliding) capybara runs straight through them. */
export const FRUIT_HEIGHT = (PLAYER_BOX.standing.bottom + PLAYER_BOX.standing.top) / 2;
export const FRUIT_LOW_HEIGHT = (PLAYER_BOX.sliding.bottom + PLAYER_BOX.sliding.top) / 2;
export const FRUIT_RADIUS = 0.4;
export const FRUIT_SPACING = 2.4;
export const POWER_HEIGHT = 0.8;

/** §8 "never by being slightly late": a head-on clip this shallow is forgiven. */
export const GRAZE_HURDLE = 0.3;
export const GRAZE_BANNER = 0.25;

/**
 * The shape of a jump, 0 → 1 → 0 over its airtime. A touch flatter than a parabola at the
 * top, so the capybara floats there (§7a).
 */
export function arc(progress: number): number {
  if (progress <= 0 || progress >= 1) return 0;
  return 1 - Math.pow(Math.abs(2 * progress - 1), 2.3);
}
