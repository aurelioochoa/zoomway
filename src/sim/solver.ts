// §B: a breadth-first search over the real controller. Every reachable capybara state is
// stepped at 60 Hz with a fresh input every 100 ms (a kid's precision, not a frame-perfect
// bot's), and any contact at all prunes it, so a "clear path" never relies on forgiveness.
//
// Each state carries the union of the tangerines collected on every path into it, so the
// union over the states that reach the end is exactly the fruit lying on some clear path,
// without keeping the search graph.

import { FRUIT_RADIUS, LANE_CHANGE_SECONDS, STEP_SECONDS } from './constants.js';
import {
  CONTACT_NONE,
  INPUT_DOWN,
  INPUT_LEFT,
  INPUT_NONE,
  INPUT_RIGHT,
  INPUT_UP,
  classifyContact,
  createRunner,
  isObstacle,
  launch,
  onSpringboard,
  stepRunner,
  touches,
  type Input,
  type Item,
  type Runner,
} from './runner.js';

const DECISION_STEPS = 6;
const ACTIONS: Input[] = [INPUT_NONE, INPUT_LEFT, INPUT_RIGHT, INPUT_UP, INPUT_DOWN];

interface Node {
  runner: Runner;
  /** Which start lanes can reach this state, as bits. */
  starts: number;
  /** Which tangerines some path into this state collected, as bits. */
  fruit: bigint;
}

export interface Proof {
  /** Per start lane: a clear path exists from it to `toZ`. */
  survivable: boolean[];
  /** The tangerines searched, and for each whether it lies on some clear path. */
  fruit: Item[];
  fruitOnPath: boolean[];
}

/** Only what can still change the future: a settled lane or a standing capybara has no clock. */
function stateKey(runner: Runner): string {
  const lateral =
    runner.laneSeconds >= LANE_CHANGE_SECONDS && runner.queuedMove === 0
      ? `${runner.lane}`
      : `${runner.lane}${runner.queuedMove}/${Math.round(runner.fromX * 100)}/${Math.round(runner.laneSeconds * 600)}`;
  const vertical =
    runner.vertical === 'ground'
      ? 'g'
      : `${runner.vertical}/${Math.round(runner.verticalSeconds * 600)}/${Math.round(runner.feet * 100)}/${Math.round(runner.jumpBuffer * 600)}`;
  return `${lateral}|${vertical}`;
}

/**
 * Search from a standing start in each lane at `fromZ` to `toZ`, at a speed that depends on
 * position only. `withFruit` false skips the fruit bookkeeping for long whole-run searches.
 */
export function prove(items: Item[], speedOf: (z: number) => number, fromZ: number, toZ: number, withFruit = true): Proof {
  const sorted = [...items].sort((first, second) => first.z - second.z);
  const fruit = withFruit ? sorted.filter((item) => item.kind === 'fruit') : [];
  const fruitBit = new Map(fruit.map((item, index) => [item, 1n << BigInt(index)]));
  const solid = sorted.filter((item) => isObstacle(item.kind) || item.kind === 'spring');

  let layer: Node[] = [0, 1, 2].map((lane) => ({ runner: createRunner(lane, fromZ), starts: 1 << lane, fruit: 0n }));
  let solidStart = 0;
  let fruitStart = 0;

  while (layer.length && layer[0]!.runner.z < toZ) {
    const z = layer[0]!.runner.z;
    const speed = speedOf(z);
    const windowEnd = z + speed * STEP_SECONDS * DECISION_STEPS + 3;
    while (solidStart < solid.length && solid[solidStart]!.z < z - 3) solidStart++;
    while (fruitStart < fruit.length && fruit[fruitStart]!.z < z - 3) fruitStart++;
    const nearSolid: Item[] = [];
    for (let index = solidStart; index < solid.length && solid[index]!.z < windowEnd; index++) nearSolid.push(solid[index]!);
    const nearFruit: Item[] = [];
    for (let index = fruitStart; index < fruit.length && fruit[index]!.z < windowEnd; index++) nearFruit.push(fruit[index]!);

    const next: Node[] = [];
    const seen = new Map<string, Node>();
    for (const node of layer) {
      for (const action of ACTIONS) {
        // Up in mid-air only buffers a jump, which the next decision on the ground covers.
        if (action === INPUT_UP && node.runner.feet > 0) continue;
        const runner: Runner = { ...node.runner };
        let collected = node.fruit;
        let alive = true;
        for (let step = 0; step < DECISION_STEPS && alive; step++) {
          stepRunner(runner, step === 0 ? action : INPUT_NONE, speed, STEP_SECONDS);
          for (const item of nearSolid) {
            if (item.kind === 'spring') {
              if (onSpringboard(runner, item)) launch(runner, 'spring');
            } else if (classifyContact(runner, item) !== CONTACT_NONE) {
              alive = false;
              break;
            }
          }
          for (const item of nearFruit) {
            if (touches(runner, item, FRUIT_RADIUS)) collected |= fruitBit.get(item)!;
          }
        }
        if (!alive) continue;
        const key = stateKey(runner);
        const existing = seen.get(key);
        if (existing) {
          existing.starts |= node.starts;
          existing.fruit |= collected;
        } else {
          const created = { runner, starts: node.starts, fruit: collected };
          seen.set(key, created);
          next.push(created);
        }
      }
    }
    layer = next;
  }

  let reachedStarts = 0;
  let reachedFruit = 0n;
  for (const node of layer) {
    reachedStarts |= node.starts;
    reachedFruit |= node.fruit;
  }
  return {
    survivable: [0, 1, 2].map((lane) => (reachedStarts & (1 << lane)) !== 0),
    fruit,
    fruitOnPath: fruit.map((item) => (reachedFruit & fruitBit.get(item)!) !== 0n),
  };
}
