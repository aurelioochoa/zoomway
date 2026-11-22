import { describe, expect, it } from 'vitest';
import { CHUNKS, INTRO, placeChunk, type Chunk } from './chunks.js';
import { decisionGapSeconds } from '../sim/constants.js';
import { prove } from '../sim/solver.js';

const speedsFor = (chunk: Chunk) =>
  chunk.tier === -1 ? [8, 9, 10] : [8, 10, 12, 14, 16, 18].filter((speed) => speed <= (chunk.topSpeed ?? 18));

describe('chunk library (§B)', () => {
  it('has every tier and a row shape the generator can read', () => {
    for (const tier of [0, 1, 2]) expect(CHUNKS.some((chunk) => chunk.tier === tier)).toBe(true);
    for (const chunk of [INTRO, ...CHUNKS]) {
      for (const [, lanes] of chunk.rows) expect(lanes, chunk.name).toMatch(/^[.BHTSOPR]{3}$/);
    }
  });

  it('never puts a blocker in all three lanes of a row', () => {
    for (const chunk of [INTRO, ...CHUNKS]) {
      for (const [, lanes] of chunk.rows) expect(lanes, chunk.name).not.toBe('BBB');
    }
  });

  it('keeps tier 0 to one kind of obstacle per row, so the warm-up teaches one move at a time', () => {
    for (const chunk of [INTRO, ...CHUNKS].filter((candidate) => candidate.tier <= 0)) {
      for (const [, lanes] of chunk.rows) expect(new Set(lanes.replace(/[.SOPR]/g, '')).size, chunk.name).toBeLessThanOrEqual(1);
    }
  });

  // Each chunk starts after the shortest decision gap its speed allows, from a standing start
  // in each lane, so a chunk that only works from the "right" lane fails here, not in a run.
  for (const chunk of [INTRO, ...CHUNKS]) {
    it.each(speedsFor(chunk))(`${chunk.name} has a clear path from every lane, with fruit only on clear paths, at %d m/s`, (speed) => {
      const placed = placeChunk(chunk, 0, speed, false);
      const lead = speed * decisionGapSeconds(speed, false);
      const proof = prove(placed.items, () => speed, placed.start - lead, placed.end + 2);
      expect(proof.survivable, 'survivable from lanes 0, 1, 2').toEqual([true, true, true]);
      const offPath = proof.fruit.filter((_, index) => !proof.fruitOnPath[index]).map((item) => `lane ${item.lane} z ${item.z.toFixed(1)}`);
      expect(offPath, 'tangerines off every clear path').toEqual([]);
    });
  }
});
