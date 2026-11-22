import { describe, expect, it } from 'vitest';
import { CHUNKS } from '../data/chunks.js';
import { speedAt } from './constants.js';
import { prove } from './solver.js';
import { Track } from './track.js';

describe('generated runs, seams included (§B)', () => {
  // Whole runs laid at a fixed speed and searched end to end, so every seam between chunks
  // is crossed for real: a pair of chunks that each pass alone but not together fails here.
  it.each([
    [1, 8, false],
    [2, 12, false],
    [3, 15, false],
    [4, 18, false],
    [5, 12, true],
  ])('seed %d at %d m/s (gentle %s) is survivable for 1.5 km', (seed, speed, gentle) => {
    const track = new Track(seed, 12);
    track.begin(0);
    while (track.laid.length < 64 && (track.laid.at(-1)?.end ?? 0) < 1500) track.lay(speed, gentle);
    const end = track.laid.at(-1)!.end;
    const proof = prove(track.items, () => speed, 0, end, false);
    expect(proof.survivable.some(Boolean)).toBe(true);
  });

  it('follows the real speed curve: the generator lays every tier as the distance grows', () => {
    const track = new Track(7, 12);
    track.begin(0);
    let seconds = 0;
    let z = 0;
    const names = new Set<string>();
    while (z < 2500) {
      const speed = speedAt(seconds, false);
      track.update(z, seconds, speed, false);
      for (const laid of track.laid) names.add(laid.name);
      seconds += 0.5;
      z += speed * 0.5;
    }
    const tiers = new Set(CHUNKS.filter((chunk) => names.has(chunk.name)).map((chunk) => chunk.tier));
    expect([...tiers].sort()).toEqual([0, 1, 2]);
  });
});
