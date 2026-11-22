// The chunk library (§B). A chunk is a few rows of {lane → thing} at offsets in metres, plus
// tangerine lines that mark a safe way through. src/data/chunks.test.ts runs every chunk at
// every speed it can appear at, from every lane, through the real controller, and fails on a
// chunk with no clear path or with fruit placed off every clear path.
//
// Row letters: B blocker (change lane), H hurdle (jump), T towel line (slide under),
// S springboard, O soap bubble, P pinwheel, R swim ring, . nothing.

import {
  FRUIT_HEIGHT,
  FRUIT_LOW_HEIGHT,
  FRUIT_SPACING,
  JUMP_APEX,
  JUMP_SECONDS,
  MESH,
  POWER_HEIGHT,
  SPRING_APEX,
  SPRING_SECONDS,
  arc,
  laneCenter,
} from '../sim/constants.js';
import type { Item, ItemKind } from '../sim/runner.js';

/** A straight line of tangerines from `from` to `to`, or an arc for a jump or a springboard. */
export type FruitLine =
  | { lane: number; from: number; to: number; low?: true }
  | { lane: number; hop: number }
  | { lane: number; spring: number };

export interface Chunk {
  name: string;
  /** 0: one kind per row (the warm-up), 1: two kinds per row, 2: dense. The intro is -1. */
  tier: -1 | 0 | 1 | 2;
  weight: number;
  /** The fastest speed this chunk is proven at, if below the 18 m/s cap. */
  topSpeed?: number;
  rows: [at: number, lanes: string][];
  fruit: FruitLine[];
}

const LETTERS: Record<string, ItemKind> = {
  B: 'blocker',
  H: 'hurdle',
  T: 'banner',
  S: 'spring',
  O: 'bubble',
  P: 'pinwheel',
  R: 'ring',
};

/**
 * §3, every run: fruit bending into the left lane, crates in the middle (~3 s), flower pots
 * under an arc of fruit (~8 s), a towel line with fruit beneath (~13 s), a bubble (~18 s).
 */
export const INTRO: Chunk = {
  name: 'intro',
  tier: -1,
  weight: 0,
  rows: [
    [24, '.B.'],
    [64, 'HHH'],
    [110, 'TTT'],
    [150, '.O.'],
  ],
  fruit: [
    { lane: 1, from: 0, to: 2.4 },
    { lane: 0.5, from: 4.8, to: 4.8 },
    { lane: 0, from: 7.2, to: 40.8 },
    { lane: 0, hop: 64 },
    { lane: 0.5, from: 80, to: 80 },
    { lane: 1, from: 84, to: 100.8 },
    { lane: 1, from: 108, to: 112.8, low: true },
    { lane: 1, from: 128, to: 142.4 },
  ],
};

export const CHUNKS: Chunk[] = [
  // Tier 0 — one kind of thing per row, so the first ~20 s teach one move at a time.
  { name: 'crate-middle', tier: 0, weight: 3, rows: [[0, '.B.']], fruit: [{ lane: 0, from: -4.8, to: 4.8 }] },
  { name: 'crate-side', tier: 0, weight: 2, rows: [[0, 'B..']], fruit: [{ lane: 1, from: -4.8, to: 4.8 }] },
  { name: 'crate-pair', tier: 0, weight: 3, rows: [[0, 'BB.']], fruit: [{ lane: 2, from: -4.8, to: 4.8 }] },
  { name: 'crate-gate', tier: 0, weight: 2, rows: [[0, 'B.B']], fruit: [{ lane: 1, from: -4.8, to: 4.8 }] },
  {
    name: 'crate-stack',
    tier: 0,
    weight: 2,
    rows: [
      [0, 'BB.'],
      [2.6, 'BB.'],
    ],
    fruit: [{ lane: 2, from: -2.4, to: 4.8 }],
  },
  { name: 'pots-all', tier: 0, weight: 3, rows: [[0, 'HHH']], fruit: [{ lane: 1, hop: 0 }] },
  { name: 'pots-pair', tier: 0, weight: 2, rows: [[0, 'HH.']], fruit: [{ lane: 0, hop: 0 }] },
  { name: 'towel-all', tier: 0, weight: 3, rows: [[0, 'TTT']], fruit: [{ lane: 1, from: -2.4, to: 2.4, low: true }] },
  { name: 'towel-pair', tier: 0, weight: 2, rows: [[0, '.TT']], fruit: [{ lane: 2, from: -2.4, to: 2.4, low: true }] },
  { name: 'springboard', tier: 0, weight: 2, rows: [[0, '.S.']], fruit: [{ lane: 1, spring: 0 }] },
  {
    name: 'fruit-weave',
    tier: 0,
    weight: 1,
    rows: [],
    fruit: [
      { lane: 0, from: 0, to: 7.2 },
      { lane: 1, from: 9.6, to: 14.4 },
      { lane: 2, from: 16.8, to: 24 },
    ],
  },
  {
    name: 'bubble',
    tier: 0,
    weight: 1,
    rows: [
      [0, '.O.'],
      [16, 'BB.'],
      [32, 'TTT'],
      [48, '.BB'],
    ],
    fruit: [
      { lane: 1, from: -4.8, to: -2.4 },
      { lane: 2, from: 12, to: 19.2 },
      { lane: 1, from: 30, to: 34.8, low: true },
      { lane: 0, from: 45.6, to: 50.4 },
    ],
  },
  {
    name: 'pinwheel',
    tier: 0,
    weight: 1,
    rows: [[0, 'P..']],
    fruit: [
      { lane: 0, from: -4.8, to: -2.4 },
      { lane: 1, from: 4.8, to: 14.4 },
      { lane: 2, from: 7.2, to: 16.8 },
      { lane: 0, from: 12, to: 21.6 },
    ],
  },
  { name: 'ring', tier: 0, weight: 1, rows: [[0, '..R']], fruit: [{ lane: 2, from: -4.8, to: -2.4 }] },

  // Tier 1 — two kinds per row, and short pairs of rows (§3: from about 20 s).
  { name: 'gate-hop', tier: 1, weight: 3, rows: [[0, 'BHB']], fruit: [{ lane: 1, hop: 0 }] },
  { name: 'gate-slide', tier: 1, weight: 3, rows: [[0, 'BTB']], fruit: [{ lane: 1, from: -2.4, to: 2.4, low: true }] },
  { name: 'hop-or-slide', tier: 1, weight: 3, rows: [[0, 'HBT']], fruit: [{ lane: 0, hop: 0 }] },
  { name: 'slide-or-hop', tier: 1, weight: 2, rows: [[0, 'HTH']], fruit: [{ lane: 1, from: -2.4, to: 2.4, low: true }] },
  { name: 'crate-pots', tier: 1, weight: 2, rows: [[0, 'BH.']], fruit: [{ lane: 2, from: -4.8, to: 4.8 }] },
  {
    name: 'hop-then-slide',
    tier: 1,
    weight: 3,
    rows: [
      [0, 'HHH'],
      [10, 'TTT'],
    ],
    fruit: [
      { lane: 1, hop: 0 },
      { lane: 1, from: 9.6, to: 12, low: true },
    ],
  },
  {
    name: 'slide-then-hop',
    tier: 1,
    weight: 3,
    rows: [
      [0, 'TTT'],
      [9, 'HHH'],
    ],
    fruit: [
      { lane: 1, from: -2.4, to: 2.4, low: true },
      { lane: 1, hop: 9 },
    ],
  },
  {
    name: 'zigzag',
    tier: 1,
    weight: 3,
    rows: [
      [0, 'BB.'],
      [12, '.BB'],
    ],
    fruit: [
      { lane: 2, from: -2.4, to: 2.4 },
      { lane: 1, from: 6, to: 6 },
      { lane: 0, from: 12, to: 14.4 },
    ],
  },
  {
    name: 'gate-then-side',
    tier: 1,
    weight: 2,
    rows: [
      [0, 'B.B'],
      [12, '.B.'],
    ],
    fruit: [
      { lane: 1, from: -2.4, to: 4.8 },
      { lane: 0, from: 10.8, to: 15.6 },
    ],
  },
  {
    name: 'spring-over-crate',
    tier: 1,
    weight: 2,
    rows: [
      [0, '.S.'],
      [4, '.B.'],
    ],
    fruit: [{ lane: 1, spring: 0 }],
  },

  // Tier 2 — denser rows for the second minute and beyond.
  {
    name: 'slalom',
    tier: 2,
    weight: 3,
    rows: [
      [0, '.BB'],
      [11, 'B.B'],
      [22, 'BB.'],
    ],
    fruit: [
      { lane: 0, from: -2.4, to: 2.4 },
      { lane: 1, from: 8.6, to: 13.4 },
      { lane: 2, from: 19.6, to: 24.4 },
    ],
  },
  {
    name: 'triple-hop',
    tier: 2,
    weight: 2,
    rows: [
      [0, 'HHH'],
      [12, 'HHH'],
      [24, 'HHH'],
    ],
    fruit: [
      { lane: 1, hop: 0 },
      { lane: 1, hop: 12 },
      { lane: 1, hop: 24 },
    ],
  },
  {
    name: 'hop-slide-hop',
    tier: 2,
    weight: 2,
    rows: [
      [0, 'HHH'],
      [10, 'TTT'],
      [19, 'HHH'],
    ],
    fruit: [
      { lane: 1, hop: 0 },
      { lane: 1, from: 9.6, to: 12, low: true },
      { lane: 1, hop: 19 },
    ],
  },
  {
    name: 'mixed-pair',
    tier: 2,
    weight: 3,
    rows: [
      [0, 'BHT'],
      [12, 'TBH'],
    ],
    fruit: [
      { lane: 2, from: -2.4, to: 2.4, low: true },
      { lane: 2, hop: 12 },
    ],
  },
  {
    name: 'towel-tunnel',
    tier: 2,
    weight: 2,
    rows: [
      [0, 'BTB'],
      [3, 'BTB'],
      [6, 'BTB'],
    ],
    fruit: [{ lane: 1, from: -2.4, to: 7.2, low: true }],
  },
  {
    name: 'crate-corridor',
    tier: 2,
    weight: 2,
    rows: [
      [0, 'B.B'],
      [2.6, 'B.B'],
      [12, 'BH.'],
    ],
    fruit: [
      { lane: 1, from: -2.4, to: 4.8 },
      { lane: 2, from: 10.8, to: 14.4 },
    ],
  },
];

export interface PlacedChunk {
  items: Item[];
  start: number;
  end: number;
}

const makeItem = (kind: ItemKind, lane: number, z: number, height: number): Item => ({
  kind,
  lane,
  x: laneCenter(lane),
  z,
  height,
  takenAt: -1,
});

/**
 * Lay a chunk out at `origin` for a given speed. Arcs scale with speed, because a jump lasts
 * the same time however fast the boards go, so the fruit always traces a real jump.
 */
export function placeChunk(chunk: Chunk, origin: number, speed: number, mirrored: boolean): PlacedChunk {
  const items: Item[] = [];
  const laneOf = (lane: number) => (mirrored ? 2 - lane : lane);
  for (const [at, lanes] of chunk.rows) {
    [...lanes].forEach((letter, lane) => {
      const kind = LETTERS[letter];
      if (kind) items.push(makeItem(kind, laneOf(lane), origin + at, POWER_HEIGHT));
    });
  }
  for (const line of chunk.fruit) {
    const lane = laneOf(line.lane);
    if ('hop' in line) {
      for (const progress of [0.2, 0.35, 0.5, 0.65, 0.8]) {
        const z = origin + line.hop + (progress - 0.5) * speed * JUMP_SECONDS;
        items.push(makeItem('fruit', lane, z, JUMP_APEX * arc(progress) + FRUIT_HEIGHT));
      }
    } else if ('spring' in line) {
      // The board launches the capybara as soon as it rolls onto the board's near edge.
      const takeoff = origin + line.spring - MESH.spring.depth / 2;
      for (const progress of [0.2, 0.35, 0.5, 0.65, 0.8]) {
        const z = takeoff + progress * speed * SPRING_SECONDS;
        items.push(makeItem('fruit', lane, z, SPRING_APEX * arc(progress) + FRUIT_HEIGHT));
      }
    } else {
      for (let z = line.from; z <= line.to + 0.01; z += FRUIT_SPACING) {
        items.push(makeItem('fruit', lane, origin + z, line.low ? FRUIT_LOW_HEIGHT : FRUIT_HEIGHT));
      }
    }
  }
  items.sort((first, second) => first.z - second.z);
  const reach = (item: Item) => (item.kind in MESH ? MESH[item.kind as keyof typeof MESH].depth / 2 : 0);
  let start = Infinity;
  let end = -Infinity;
  for (const item of items) {
    start = Math.min(start, item.z - reach(item));
    // A chunk lasts until a springboard's flight has landed, so no seam hides under it.
    const landing = item.kind === 'spring' ? item.z - reach(item) + speed * SPRING_SECONDS : item.z + reach(item);
    end = Math.max(end, landing);
  }
  return { items, start, end };
}
