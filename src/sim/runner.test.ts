import { describe, expect, it } from 'vitest';
import { JUMP_APEX, MESH, STEP_SECONDS, hitBox, laneCenter } from './constants.js';
import {
  CONTACT_FRONT,
  CONTACT_GRAZE,
  CONTACT_NONE,
  CONTACT_SIDE,
  INPUT_DOWN,
  INPUT_LEFT,
  INPUT_NONE,
  INPUT_UP,
  classifyContact,
  createRunner,
  stepRunner,
  type Input,
  type Item,
  type Runner,
} from './runner.js';

const steps = (runner: Runner, count: number, input: Input = INPUT_NONE, speed = 10) => {
  for (let step = 0; step < count; step++) stepRunner(runner, step === 0 ? input : INPUT_NONE, speed, STEP_SECONDS);
};
const obstacle = (kind: Item['kind'], lane: number, z: number): Item => ({ kind, lane, x: laneCenter(lane), z, height: 0, takenAt: -1 });

describe('controller timings (§7a)', () => {
  it('changes lane in 0.14 s', () => {
    const runner = createRunner(1, 0);
    steps(runner, 8, INPUT_LEFT);
    expect(runner.x).toBeGreaterThan(laneCenter(0));
    steps(runner, 1);
    expect(runner.x).toBeCloseTo(laneCenter(0), 5);
  });

  it('queues one more lane change pressed during a change', () => {
    const runner = createRunner(2, 0);
    steps(runner, 3, INPUT_LEFT);
    steps(runner, 20, INPUT_LEFT);
    expect(runner.lane).toBe(0);
    expect(runner.x).toBeCloseTo(laneCenter(0), 5);
  });

  it('jumps for 0.6 s to a 1.6 m apex', () => {
    const runner = createRunner(1, 0);
    let apex = 0;
    let airborneSteps = 0;
    stepRunner(runner, INPUT_UP, 10, STEP_SECONDS);
    while (runner.feet > 0) {
      apex = Math.max(apex, runner.feet);
      airborneSteps++;
      stepRunner(runner, INPUT_NONE, 10, STEP_SECONDS);
    }
    expect(apex).toBeCloseTo(JUMP_APEX, 2);
    expect((airborneSteps + 1) * STEP_SECONDS).toBeCloseTo(0.6, 1);
  });

  it('fires a jump pressed up to 100 ms before landing, and not one pressed earlier', () => {
    const early = createRunner(1, 0);
    steps(early, 36 - 12, INPUT_UP);
    steps(early, 14, INPUT_UP);
    expect(early.vertical).toBe('ground');
    const buffered = createRunner(1, 0);
    steps(buffered, 36 - 5, INPUT_UP);
    steps(buffered, 8, INPUT_UP);
    expect(buffered.vertical).toBe('jump');
  });

  it('drops straight into a slide when down is pressed in mid-air', () => {
    const runner = createRunner(1, 0);
    steps(runner, 18, INPUT_UP);
    expect(runner.feet).toBeGreaterThan(1.4);
    steps(runner, 8, INPUT_DOWN);
    expect(runner.feet).toBe(0);
    expect(runner.vertical).toBe('slide');
  });
});

describe('contact rule (§8)', () => {
  it('uses hitboxes 15 % smaller than the meshes', () => {
    const box = hitBox(MESH.blocker);
    expect(box.halfWidth * 2).toBeCloseTo(MESH.blocker.width * 0.85, 5);
    expect(box.top - box.bottom).toBeCloseTo(MESH.blocker.top * 0.85, 5);
  });

  it('calls running into a crate in your lane head-on', () => {
    const runner = createRunner(1, 0);
    const crate = obstacle('blocker', 1, 3);
    let contact = CONTACT_NONE;
    for (let step = 0; step < 30 && contact === CONTACT_NONE; step++) {
      stepRunner(runner, INPUT_NONE, 10, STEP_SECONDS);
      contact = classifyContact(runner, crate);
    }
    expect(contact).toBe(CONTACT_FRONT);
  });

  it('calls steering sideways into a crate beside you a scrape, not a bonk', () => {
    const runner = createRunner(1, 0);
    const crate = obstacle('blocker', 0, 0.5);
    let contact = CONTACT_NONE;
    stepRunner(runner, INPUT_LEFT, 1, STEP_SECONDS);
    for (let step = 0; step < 12 && contact === CONTACT_NONE; step++) {
      stepRunner(runner, INPUT_NONE, 1, STEP_SECONDS);
      contact = classifyContact(runner, crate);
    }
    expect(contact).toBe(CONTACT_SIDE);
  });

  it('forgives a slightly late jump that only clips the top of the flower pots', () => {
    const runner = createRunner(1, 0);
    const pots = obstacle('hurdle', 1, 0.9);
    stepRunner(runner, INPUT_UP, 10, STEP_SECONDS);
    let contact = CONTACT_NONE;
    for (let step = 0; step < 10 && contact === CONTACT_NONE; step++) {
      stepRunner(runner, INPUT_NONE, 10, STEP_SECONDS);
      contact = classifyContact(runner, pots);
    }
    expect(contact).toBe(CONTACT_GRAZE);
  });

  it('forgives a crate reached while already steering out of its lane', () => {
    const runner = createRunner(1, 0);
    const crate = obstacle('blocker', 1, 1.1);
    stepRunner(runner, INPUT_LEFT, 10, STEP_SECONDS);
    let contact = CONTACT_NONE;
    for (let step = 0; step < 10 && contact === CONTACT_NONE; step++) {
      stepRunner(runner, INPUT_NONE, 10, STEP_SECONDS);
      contact = classifyContact(runner, crate);
    }
    expect(contact).toBe(CONTACT_GRAZE);
  });
});
