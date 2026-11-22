import { describe, expect, it } from 'vitest';
import { placeChunk, type Chunk } from '../data/chunks.js';
import { prove } from './solver.js';

// The library passing proves nothing unless the search can fail: each of these is a chunk
// the generator must never be given.
const chunk = (rows: Chunk['rows'], fruit: Chunk['fruit'] = []): Chunk => ({ name: 'probe', tier: 0, weight: 1, rows, fruit });
const search = (probe: Chunk, speed: number) => {
  const placed = placeChunk(probe, 0, speed, false);
  return prove(placed.items, () => speed, placed.start - 14, placed.end + 2);
};

describe('the solver rejects what a kid could not survive (§B)', () => {
  it('a wall of crates across all three lanes', () => {
    expect(search(chunk([[0, 'BBB']]), 10).survivable).toEqual([false, false, false]);
  });

  it('a towel line so close behind the flower pots that no capybara is both high and low', () => {
    expect(search(chunk([[0, 'HHH'], [1, 'TTT']]), 8).survivable).toEqual([false, false, false]);
  });

  it('flower pots close together are still fine for a jump, a drop and a jump out of the slide', () => {
    expect(search(chunk([[0, 'HHH'], [2.8, 'HHH']]), 8).survivable).toEqual([true, true, true]);
  });

  it('a two-lane switch faster than the controller can make one', () => {
    expect(search(chunk([[0, 'BB.'], [2.5, '.BB']]), 18).survivable).toEqual([false, false, false]);
  });

  it('a tangerine hidden inside a crate is off every clear path', () => {
    const proof = search(chunk([[0, '.B.']], [{ lane: 1, from: 0, to: 0 }, { lane: 0, from: 0, to: 0 }]), 10);
    expect(proof.survivable).toEqual([true, true, true]);
    const onPathByLane = Object.fromEntries(proof.fruit.map((item, index) => [item.lane, proof.fruitOnPath[index]]));
    expect(onPathByLane).toEqual({ 0: true, 1: false });
  });

  it('accepts the same chunk spaced out enough to survive', () => {
    expect(search(chunk([[0, 'HHH'], [11, 'HHH']]), 8).survivable).toEqual([true, true, true]);
  });
});
