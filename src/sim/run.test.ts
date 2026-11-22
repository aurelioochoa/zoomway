import { describe, expect, it } from 'vitest';
import { LOOK_AHEAD, STEP_SECONDS, decisionGapSeconds, laneCenter, speedAt } from './constants.js';
import {
  EVENT_BONK,
  EVENT_BUBBLE_POP,
  EVENT_FLAG,
  EVENT_RING_POP,
  EVENT_SCRAPE,
  EVENT_ZONE,
  Run,
} from './run.js';
import { INPUT_LEFT, INPUT_NONE, INPUT_RIGHT, INPUT_UP, isObstacle, type Input, type Item } from './runner.js';

const play = (run: Run, seconds: number, input: (run: Run) => Input = () => INPUT_NONE) => {
  let events = 0;
  for (let step = 0; step < seconds / STEP_SECONDS && !run.over; step++) events |= run.step(input(run));
  return events;
};
const crate = (lane: number, z: number): Item => ({ kind: 'blocker', lane, x: laneCenter(lane), z, height: 0, takenAt: -1 });

describe('speed (§7a, §D)', () => {
  it('follows v = 8 + 10(1 − e^(−t/90)) and never passes 18', () => {
    expect(speedAt(0, false)).toBe(8);
    expect(speedAt(30, false)).toBeCloseTo(10.8, 1);
    expect(speedAt(60, false)).toBeCloseTo(12.9, 1);
    expect(speedAt(120, false)).toBeCloseTo(15.4, 1);
    expect(speedAt(100000, false)).toBeLessThanOrEqual(18);
  });

  it('Gentle caps at 12 m/s and climbs slower', () => {
    expect(speedAt(100000, true)).toBeLessThanOrEqual(12);
    expect(speedAt(60, true)).toBeLessThan(speedAt(60, false));
  });

  it('keeps the decision gap at 1.6 s in the warm-up, 0.75 s at the cap, 1.2 s in Gentle', () => {
    expect(decisionGapSeconds(speedAt(20, false), false)).toBeCloseTo(1.6, 5);
    expect(decisionGapSeconds(18, false)).toBeCloseTo(0.75, 5);
    for (let speed = 8; speed <= 12; speed += 0.5) expect(decisionGapSeconds(speed, true)).toBeGreaterThanOrEqual(1.2);
  });
});

describe('the opening cruise (§3, §8)', () => {
  it('never times out and never brings an obstacle into view', () => {
    const run = new Run(11, false, 0, 0);
    for (let step = 0; step < 60 * 60 * 5; step++) {
      run.step(INPUT_NONE);
      if (step % 600 === 0) {
        expect(run.track.items.some((item) => isObstacle(item.kind) && item.z < run.runner.z + LOOK_AHEAD)).toBe(false);
      }
    }
    expect(run.started).toBe(false);
    expect(run.over).toBe(false);
  });

  it('obeys the first input at once', () => {
    const run = new Run(11, false, 0, 0);
    play(run, 2);
    run.step(INPUT_LEFT);
    expect(run.started).toBe(true);
    expect(run.runner.lane).toBe(0);
  });

  it('is the same run for the same seed and inputs', () => {
    const first = new Run(5, false, 0, 0);
    const second = new Run(5, false, 0, 0);
    for (const run of [first, second]) {
      run.step(INPUT_RIGHT);
      play(run, 30);
    }
    expect(second.distance).toBe(first.distance);
    expect(second.track.items.map((item) => item.z)).toEqual(first.track.items.map((item) => item.z));
  });
});

describe('failure is forgiving (§8)', () => {
  it('pops the swim ring on the first bonk and ends the run on the second', () => {
    const run = new Run(3, false, 0, 0);
    run.step(INPUT_UP);
    const events = play(run, 60);
    expect(events & EVENT_RING_POP).toBeTruthy();
    expect(events & EVENT_BONK).toBeTruthy();
    expect(run.over).toBe(true);
    expect(run.ring).toBe(false);
    expect(run.bonked).not.toBeNull();
  });

  it('bounces a sideways scrape back to its lane and keeps the ring', () => {
    const run = new Run(3, false, 0, 0);
    run.step(INPUT_RIGHT);
    play(run, 0.5);
    run.track.items.push(crate(1, run.runner.z + 0.6));
    run.track.items.sort((first, second) => first.z - second.z);
    const events = play(run, 0.3, (current) => (current.runner.lane === 2 ? INPUT_LEFT : INPUT_NONE));
    expect(events & EVENT_SCRAPE).toBeTruthy();
    expect(run.over).toBe(false);
    expect(run.ring).toBe(true);
  });

  it('keeps a bubble floating until an empty landing stretch lies ahead', () => {
    const run = new Run(3, false, 0, 0);
    run.step(INPUT_LEFT);
    run.ring = false;
    run.runner.vertical = 'float';
    run.runner.feet = 2.4;
    run.bubbleSeconds = 0;
    const crateAhead = crate(0, run.runner.z + 6);
    run.track.items.push(crateAhead);
    run.track.items.sort((first, second) => first.z - second.z);
    let events = 0;
    while (run.runner.z < crateAhead.z && !(events & EVENT_BUBBLE_POP)) events |= run.step(INPUT_NONE);
    expect(events & EVENT_BUBBLE_POP).toBeFalsy();
    play(run, 2);
    expect(run.runner.feet).toBe(0);
    expect(run.over).toBe(false);
  });
});

describe('the flag and the zones (§4, §5)', () => {
  it('signals passing the best distance once', () => {
    const run = new Run(9, false, 20, 20);
    run.step(INPUT_LEFT);
    expect(play(run, 5) & EVENT_FLAG).toBeTruthy();
    expect(play(run, 1) & EVENT_FLAG).toBeFalsy();
  });

  it('reaches a zone for the first time only beyond the furthest run ever', () => {
    const fresh = new Run(9, false, 0, 0);
    fresh.step(INPUT_LEFT);
    fresh.runner.z = fresh.startZ + 599;
    expect(play(fresh, 0.5) & EVENT_ZONE).toBeTruthy();
    expect(fresh.zoneReached).toBe(1);
    const seen = new Run(9, false, 0, 700);
    seen.step(INPUT_LEFT);
    seen.runner.z = seen.startZ + 599;
    expect(play(seen, 0.5) & EVENT_ZONE).toBeFalsy();
  });
});
