// The capybara's controller (§7a) and the contact rule (§8). Pure and allocation-free, so
// the game and the solver that proves every chunk survivable (§B) step the very same code.

import {
  BUBBLE_DESCENT_SECONDS,
  BUBBLE_HEIGHT,
  DROP_SPEED,
  GRAZE_BANNER,
  GRAZE_HURDLE,
  JUMP_APEX,
  JUMP_BUFFER_SECONDS,
  JUMP_SECONDS,
  LANE_CHANGE_SECONDS,
  MESH,
  PLAYER_BOX,
  SCRAPE_SECONDS,
  SLIDE_SECONDS,
  SPRING_APEX,
  SPRING_SECONDS,
  arc,
  hitBox,
  laneCenter,
} from './constants.js';

export const INPUT_NONE = 0;
export const INPUT_LEFT = 1;
export const INPUT_RIGHT = 2;
export const INPUT_UP = 3;
export const INPUT_DOWN = 4;
export type Input = 0 | 1 | 2 | 3 | 4;

export type Vertical = 'ground' | 'jump' | 'spring' | 'drop' | 'slide' | 'float' | 'descent';

export type ItemKind = 'blocker' | 'hurdle' | 'banner' | 'spring' | 'fruit' | 'bubble' | 'pinwheel' | 'ring';

export interface Item {
  kind: ItemKind;
  lane: number;
  x: number;
  z: number;
  /** Centre height, for tangerines and power-ups. */
  height: number;
  /** Run time it was collected, or -1. */
  takenAt: number;
}

export interface Runner {
  x: number;
  z: number;
  feet: number;
  /** The lane being moved to, or stood in. */
  lane: number;
  fromLane: number;
  fromX: number;
  laneSeconds: number;
  /** One lane change queued during another: -1, 0 or +1 (§7a). */
  queuedMove: number;
  vertical: Vertical;
  verticalSeconds: number;
  jumpBuffer: number;
  scrapeSeconds: number;
  previousX: number;
  previousZ: number;
  previousFeet: number;
}

export function createRunner(lane: number, z: number): Runner {
  const x = laneCenter(lane);
  return {
    x,
    z,
    feet: 0,
    lane,
    fromLane: lane,
    fromX: x,
    laneSeconds: LANE_CHANGE_SECONDS,
    queuedMove: 0,
    vertical: 'ground',
    verticalSeconds: 0,
    jumpBuffer: 0,
    scrapeSeconds: 0,
    previousX: x,
    previousZ: z,
    previousFeet: 0,
  };
}

export const isLow = (runner: Runner): boolean => runner.vertical === 'slide' || runner.vertical === 'drop';
export const isAirborne = (runner: Runner): boolean => runner.feet > 0;
const playerBox = (runner: Runner) => (isLow(runner) ? PLAYER_BOX.sliding : PLAYER_BOX.standing);
export const runnerBottom = (runner: Runner): number => runner.feet + playerBox(runner).bottom;
export const runnerTop = (runner: Runner): number => runner.feet + playerBox(runner).top;

function startLaneChange(runner: Runner, move: number): void {
  const target = runner.lane + move;
  if (target < 0 || target > 2) return;
  runner.fromLane = runner.lane;
  runner.fromX = runner.x;
  runner.lane = target;
  runner.laneSeconds = 0;
}

export function launch(runner: Runner, vertical: 'jump' | 'spring'): void {
  runner.vertical = vertical;
  runner.verticalSeconds = 0;
  runner.jumpBuffer = 0;
}

function land(runner: Runner): void {
  runner.feet = 0;
  if (runner.jumpBuffer > 0) launch(runner, 'jump');
  else runner.vertical = 'ground';
}

/** §8 side scrape: back to the lane it came from with a wobble; nothing is lost. */
export function bounceBack(runner: Runner): void {
  runner.lane = runner.fromLane;
  runner.fromX = runner.x;
  runner.laneSeconds = 0;
  runner.queuedMove = 0;
  runner.scrapeSeconds = SCRAPE_SECONDS;
}

export function stepRunner(runner: Runner, input: Input, speed: number, seconds: number): void {
  runner.previousX = runner.x;
  runner.previousZ = runner.z;
  runner.previousFeet = runner.feet;

  if (input === INPUT_LEFT || input === INPUT_RIGHT) {
    const move = input === INPUT_LEFT ? -1 : 1;
    if (runner.laneSeconds < LANE_CHANGE_SECONDS) runner.queuedMove = move;
    else startLaneChange(runner, move);
  } else if (input === INPUT_UP) {
    if (runner.vertical === 'ground' || runner.vertical === 'slide') launch(runner, 'jump');
    else if (runner.vertical !== 'float') runner.jumpBuffer = JUMP_BUFFER_SECONDS;
  } else if (input === INPUT_DOWN) {
    // §7a: down in mid-air drops straight into a slide.
    if (runner.vertical === 'jump' || runner.vertical === 'spring') runner.vertical = 'drop';
    else if (runner.vertical === 'ground' || runner.vertical === 'slide') {
      runner.vertical = 'slide';
      runner.verticalSeconds = 0;
    }
  }

  runner.laneSeconds += seconds;
  if (runner.laneSeconds >= LANE_CHANGE_SECONDS && runner.queuedMove !== 0) {
    startLaneChange(runner, runner.queuedMove);
    runner.queuedMove = 0;
  }
  const progress = Math.min(1, runner.laneSeconds / LANE_CHANGE_SECONDS);
  runner.x = runner.fromX + (laneCenter(runner.lane) - runner.fromX) * (1 - (1 - progress) ** 2);

  runner.verticalSeconds += seconds;
  runner.jumpBuffer = Math.max(0, runner.jumpBuffer - seconds);
  runner.scrapeSeconds = Math.max(0, runner.scrapeSeconds - seconds);
  switch (runner.vertical) {
    case 'jump':
    case 'spring': {
      const duration = runner.vertical === 'jump' ? JUMP_SECONDS : SPRING_SECONDS;
      const apex = runner.vertical === 'jump' ? JUMP_APEX : SPRING_APEX;
      if (runner.verticalSeconds >= duration) land(runner);
      else runner.feet = apex * arc(runner.verticalSeconds / duration);
      break;
    }
    case 'drop':
      runner.feet -= DROP_SPEED * seconds;
      if (runner.feet <= 0) {
        runner.feet = 0;
        runner.vertical = 'slide';
        runner.verticalSeconds = 0;
        runner.jumpBuffer = 0;
      }
      break;
    case 'slide':
      if (runner.verticalSeconds >= SLIDE_SECONDS) runner.vertical = 'ground';
      break;
    case 'float':
      runner.feet += (BUBBLE_HEIGHT - runner.feet) * Math.min(1, seconds * 8);
      break;
    case 'descent':
      runner.feet -= (BUBBLE_HEIGHT / BUBBLE_DESCENT_SECONDS) * seconds;
      if (runner.feet <= 0) land(runner);
      break;
    case 'ground':
      break;
  }
  runner.z += speed * seconds;
}

export const CONTACT_NONE = 0;
/** Head-on: the only contact that ends a run (§8). */
export const CONTACT_FRONT = 1;
/** Steered sideways into it: bounce back, nothing lost (§8). */
export const CONTACT_SIDE = 2;
/** Came down onto it or rose into it from beside: forgiven. */
export const CONTACT_VERTICAL = 3;
/** Head-on but only just, or already leaving the lane: "never by being slightly late". */
export const CONTACT_GRAZE = 4;

export const OBSTACLE_BOX = {
  blocker: hitBox(MESH.blocker),
  hurdle: hitBox(MESH.hurdle),
  banner: hitBox(MESH.banner),
};

export const isObstacle = (kind: ItemKind): kind is 'blocker' | 'hurdle' | 'banner' =>
  kind === 'blocker' || kind === 'hurdle' || kind === 'banner';

export function classifyContact(runner: Runner, item: Item): number {
  if (!isObstacle(item.kind)) return CONTACT_NONE;
  const box = OBSTACLE_BOX[item.kind];
  const reachX = box.halfWidth + PLAYER_BOX.standing.halfWidth;
  const reachZ = box.halfDepth + PLAYER_BOX.standing.halfDepth;
  const depthOverlap = Math.min(runnerTop(runner), box.top) - Math.max(runnerBottom(runner), box.bottom);
  if (Math.abs(runner.x - item.x) >= reachX || Math.abs(runner.z - item.z) >= reachZ || depthOverlap <= 0) {
    return CONTACT_NONE;
  }
  if (Math.abs(runner.previousZ - item.z) >= reachZ) {
    if (runner.lane !== item.lane) return CONTACT_GRAZE;
    if (item.kind === 'hurdle' && depthOverlap <= GRAZE_HURDLE) return CONTACT_GRAZE;
    if (item.kind === 'banner' && depthOverlap <= GRAZE_BANNER) return CONTACT_GRAZE;
    return CONTACT_FRONT;
  }
  if (Math.abs(runner.previousX - item.x) >= reachX) return CONTACT_SIDE;
  return CONTACT_VERTICAL;
}

/** A springboard launches a capybara that rolls over it on its skates. */
export function onSpringboard(runner: Runner, item: Item): boolean {
  return (
    item.kind === 'spring' &&
    (runner.vertical === 'ground' || runner.vertical === 'slide') &&
    Math.abs(runner.x - item.x) < MESH.spring.width / 2 &&
    Math.abs(runner.z - item.z) < MESH.spring.depth / 2
  );
}

/** Tangerines and power-ups: a generous touch, from any direction. */
export function touches(runner: Runner, item: Item, radius: number): boolean {
  return (
    Math.abs(runner.x - item.x) < PLAYER_BOX.standing.halfWidth + radius &&
    Math.abs(runner.z - item.z) < PLAYER_BOX.standing.halfDepth + radius &&
    item.height > runnerBottom(runner) - radius &&
    item.height < runnerTop(runner) + radius
  );
}
