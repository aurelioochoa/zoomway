// One run's rules (§4, §8, §9): the speed curve, power-ups, the swim ring, side scrapes,
// the bonk, the flag and the zones. Fixed 60 Hz steps and a seeded track, so the same seed
// and the same inputs always give the same run (§12).

import {
  BUBBLE_DESCENT_SECONDS,
  BUBBLE_LANDING_SECONDS,
  BUBBLE_SECONDS,
  CRUISE_SPEED,
  FRUIT_RADIUS,
  PINWHEEL_REACH,
  PINWHEEL_SECONDS,
  RING_GRACE_SECONDS,
  SPEED_EASE_SECONDS,
  STEP_SECONDS,
  ZONE_STARTS,
  speedAt,
} from './constants.js';
import {
  CONTACT_FRONT,
  CONTACT_GRAZE,
  CONTACT_SIDE,
  INPUT_NONE,
  OBSTACLE_BOX,
  bounceBack,
  classifyContact,
  createRunner,
  isLow,
  isObstacle,
  launch,
  onSpringboard,
  stepRunner,
  touches,
  type Input,
  type Item,
  type Runner,
} from './runner.js';
import { Track } from './track.js';

export const EVENT_LANE = 1 << 0;
export const EVENT_JUMP = 1 << 1;
export const EVENT_SLIDE = 1 << 2;
export const EVENT_LAND = 1 << 3;
export const EVENT_FRUIT = 1 << 4;
export const EVENT_SCRAPE = 1 << 5;
export const EVENT_BONK = 1 << 6;
export const EVENT_RING_POP = 1 << 7;
export const EVENT_RING_GET = 1 << 8;
export const EVENT_BUBBLE_GET = 1 << 9;
export const EVENT_BUBBLE_POP = 1 << 10;
export const EVENT_PINWHEEL_GET = 1 << 11;
export const EVENT_SPRING = 1 << 12;
export const EVENT_NEAR_MISS = 1 << 13;
export const EVENT_FLAG = 1 << 14;
export const EVENT_ZONE = 1 << 15;
export const EVENT_UNDER = 1 << 16;
export const EVENT_START = 1 << 17;

/** A dodge this soon before the obstacle passes is a near miss: felt, never scored (§4). */
const NEAR_MISS_SECONDS = 0.45;

export class Run {
  readonly runner: Runner;
  readonly track: Track;
  started = false;
  over = false;
  /** Seconds since the run was made (the cruise included), for animation. */
  time = 0;
  runSeconds = 0;
  speed = CRUISE_SPEED;
  startZ = 0;
  fruit = 0;
  /** §8: every run starts with a swim ring. */
  ring = true;
  graceSeconds = 0;
  bubbleSeconds = 0;
  pinwheelSeconds = 0;
  bonked: Item | null = null;
  /** The zone just reached for the first time, with EVENT_ZONE. */
  zoneReached = 0;
  private flagPassed = false;
  private lastDodgeTime = -9;
  private dodgedLane = -1;
  private grazed: Item | null = null;

  constructor(
    seed: number,
    readonly gentle: boolean,
    /** The best this run is chasing: its flag stands there (§4). */
    readonly best: number,
    /** The furthest any run has gone, in either mode: zones are first reached past it (§5). */
    readonly furthestEver: number,
  ) {
    this.runner = createRunner(1, 0);
    this.track = new Track(seed, 12);
  }

  get distance(): number {
    return this.started ? this.runner.z - this.startZ : 0;
  }

  get floating(): boolean {
    return this.runner.vertical === 'float' || this.runner.vertical === 'descent';
  }

  /** The first input (§3): the run begins and that same input is obeyed. */
  begin(): void {
    this.started = true;
    this.startZ = this.runner.z;
    this.track.begin(this.startZ);
  }

  step(input: Input): number {
    this.time += STEP_SECONDS;
    if (this.over) return 0;
    let events = 0;
    if (!this.started) {
      if (input === INPUT_NONE) {
        const before = this.runner.z;
        stepRunner(this.runner, INPUT_NONE, CRUISE_SPEED, STEP_SECONDS);
        this.track.ride(this.runner.z - before);
        return 0;
      }
      this.begin();
      events |= EVENT_START;
    }
    const runner = this.runner;
    this.runSeconds += STEP_SECONDS;
    const target = speedAt(this.runSeconds, this.gentle);
    this.speed += (target - this.speed) * Math.min(1, STEP_SECONDS / SPEED_EASE_SECONDS);

    const laneBefore = runner.lane;
    const verticalBefore = runner.vertical;
    const airborneBefore = runner.feet > 0;
    const distanceBefore = this.distance;
    stepRunner(runner, input, this.speed, STEP_SECONDS);
    if (runner.lane !== laneBefore) {
      events |= EVENT_LANE;
      this.lastDodgeTime = this.runSeconds;
      this.dodgedLane = laneBefore;
    }
    if (runner.vertical === 'jump' && (verticalBefore !== 'jump' || runner.verticalSeconds < STEP_SECONDS * 1.5)) {
      events |= EVENT_JUMP;
    }
    if (isLow(runner) && runner.verticalSeconds < STEP_SECONDS * 1.5 && verticalBefore !== 'drop') events |= EVENT_SLIDE;
    if (runner.vertical === 'drop' && verticalBefore !== 'drop') events |= EVENT_SLIDE;
    if (airborneBefore && runner.feet === 0) events |= EVENT_LAND;

    this.graceSeconds = Math.max(0, this.graceSeconds - STEP_SECONDS);
    this.pinwheelSeconds = Math.max(0, this.pinwheelSeconds - STEP_SECONDS);
    if (runner.vertical === 'float') {
      this.bubbleSeconds = Math.max(0, this.bubbleSeconds - STEP_SECONDS);
      // §9: the bubble wobbles until an empty landing stretch lies ahead, then pops onto it.
      if (this.bubbleSeconds === 0 && this.landingClear()) {
        runner.vertical = 'descent';
        events |= EVENT_BUBBLE_POP;
      }
    }

    this.track.update(runner.z, this.runSeconds, this.speed, this.gentle);
    events |= this.touchItems();

    const distance = this.distance;
    if (!this.flagPassed && this.best > 0 && distanceBefore < this.best && distance >= this.best) {
      this.flagPassed = true;
      events |= EVENT_FLAG;
    }
    for (let zone = 1; zone < ZONE_STARTS.length; zone++) {
      const start = ZONE_STARTS[zone]!;
      if (start > this.furthestEver && distanceBefore < start && distance >= start) {
        this.zoneReached = zone;
        events |= EVENT_ZONE;
      }
    }
    return events;
  }

  private touchItems(): number {
    const runner = this.runner;
    let events = 0;
    for (const item of this.track.items) {
      if (item.z > runner.z + PINWHEEL_REACH) break;
      if (item.z < runner.z - 3 || item.takenAt >= 0) continue;
      if (isObstacle(item.kind)) {
        events |= this.passObstacle(item);
        if (this.over) return events | EVENT_BONK;
        continue;
      }
      if (item.kind === 'spring') {
        if (onSpringboard(runner, item)) {
          launch(runner, 'spring');
          events |= EVENT_SPRING;
        }
        continue;
      }
      const pulled = this.pinwheelSeconds > 0 && item.kind === 'fruit' && item.z > runner.z - 1;
      const floatedThrough =
        this.floating && Math.abs(runner.x - item.x) < 0.75 && Math.abs(runner.z - item.z) < 0.8;
      if (!pulled && !floatedThrough && !touches(runner, item, FRUIT_RADIUS)) continue;
      item.takenAt = this.time;
      if (item.kind === 'fruit') {
        this.fruit++;
        events |= EVENT_FRUIT;
      } else if (item.kind === 'bubble') {
        runner.vertical = 'float';
        runner.verticalSeconds = 0;
        this.bubbleSeconds = BUBBLE_SECONDS;
        events |= EVENT_BUBBLE_GET;
      } else if (item.kind === 'pinwheel') {
        this.pinwheelSeconds = PINWHEEL_SECONDS;
        events |= EVENT_PINWHEEL_GET;
      } else {
        this.ring = true;
        events |= EVENT_RING_GET;
      }
    }
    return events;
  }

  private passObstacle(item: Item): number {
    const runner = this.runner;
    let events = 0;
    const reach = OBSTACLE_BOX[item.kind as keyof typeof OBSTACLE_BOX].halfDepth;
    // Just passed this step: a dodge out of its lane a moment ago was a near miss.
    if (item.z + reach < runner.z && item.z + reach >= runner.previousZ) {
      if (item.lane === this.dodgedLane && runner.lane !== item.lane && this.runSeconds - this.lastDodgeTime < NEAR_MISS_SECONDS) {
        events |= EVENT_NEAR_MISS;
      }
      if (item.kind === 'banner' && item.lane === runner.lane && isLow(runner)) events |= EVENT_UNDER;
    }
    if (this.floating || this.graceSeconds > 0) return events;
    const contact = classifyContact(runner, item);
    if (contact === CONTACT_FRONT) {
      if (this.ring) {
        this.ring = false;
        this.graceSeconds = RING_GRACE_SECONDS;
        return events | EVENT_RING_POP;
      }
      this.over = true;
      this.bonked = item;
      this.speed = 0;
    } else if (contact === CONTACT_SIDE && runner.scrapeSeconds === 0) {
      bounceBack(runner);
      events |= EVENT_SCRAPE;
    } else if (contact === CONTACT_GRAZE && this.grazed !== item) {
      this.grazed = item;
      events |= EVENT_NEAR_MISS;
    }
    return events;
  }

  /** Nothing in the bubble's lane between here and a second past where it touches down. */
  private landingClear(): boolean {
    const runner = this.runner;
    const reach = runner.z + this.speed * (BUBBLE_DESCENT_SECONDS + BUBBLE_LANDING_SECONDS);
    for (const item of this.track.items) {
      if (item.z > reach + 2) break;
      if (isObstacle(item.kind) && item.lane === runner.lane && item.z > runner.z - 2) return false;
    }
    return true;
  }
}
