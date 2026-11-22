// The boardwalk ahead (§B): the intro every run, then chunks picked by tier and speed and
// joined by the speed-scaled decision gap (§7a). Deterministic from the run's seed.

import { CHUNKS, INTRO, placeChunk, type Chunk } from '../data/chunks.js';
import { BUSY_DISTANCE, LOOK_AHEAD, WARM_UP_DISTANCE, decisionGapSeconds, speedAt } from './constants.js';
import { SeededRandom } from './random.js';
import type { Item } from './runner.js';

/** The intro's opening fruit line is all the cruise shows (§3). */
const CRUISE_LINE_END = 44;
/** Power-ups stay special: at least this much boardwalk between two of them. */
const POWER_SPACING = 300;
const INTRO_SPEED = 9;

const hasPower = (chunk: Chunk) => chunk.rows.some(([, lanes]) => /[OPR]/.test(lanes));

export class Track {
  /** Everything on the boards, sorted by z. */
  readonly items: Item[] = [];
  private readonly random: SeededRandom;
  private held: Item[];
  private cursor = 0;
  private runStart = 0;
  private lastChunk = '';
  private lastPower = -Infinity;
  /** Where the last chunk was laid, for tests that read the generator's choices. */
  readonly laid: { name: string; start: number; end: number; speed: number; mirrored: boolean }[] = [];

  constructor(seed: number, origin: number) {
    this.random = new SeededRandom(seed);
    const intro = placeChunk(INTRO, origin, INTRO_SPEED, false);
    const isCruise = (item: Item) => item.kind === 'fruit' && item.z < origin + CRUISE_LINE_END;
    this.items.push(...intro.items.filter(isCruise));
    this.held = intro.items.filter((item) => !isCruise(item));
    this.cursor = intro.end;
    this.lastPower = intro.end;
  }

  /** The cruise: the fruit line keeps its distance, so the opening never times out (§8). */
  ride(distance: number): void {
    for (const item of this.items) item.z += distance;
    for (const item of this.held) item.z += distance;
    this.cursor += distance;
    this.lastPower += distance;
  }

  /** The first input: the rest of the intro lands on the boards ahead. */
  begin(runStart: number): void {
    this.runStart = runStart;
    this.items.push(...this.held);
    this.items.sort((first, second) => first.z - second.z);
    this.held = [];
  }

  /** Keep LOOK_AHEAD metres of boardwalk built ahead and drop what is well behind. */
  update(playerZ: number, runSeconds: number, speed: number, gentle: boolean): void {
    while (this.cursor < playerZ + LOOK_AHEAD) {
      const arrival = runSeconds + (this.cursor - playerZ) / Math.max(speed, 1);
      this.lay(speedAt(arrival, gentle), gentle);
    }
    while (this.items.length && this.items[0]!.z < playerZ - 12) this.items.shift();
  }

  /** Lay one chunk at a given speed. Public so tests can build whole runs at any speed. */
  lay(speed: number, gentle: boolean): void {
    const distance = this.cursor - this.runStart;
    const tier = distance < WARM_UP_DISTANCE ? 0 : distance < BUSY_DISTANCE ? 1 : 2;
    const candidates = CHUNKS.filter(
      (chunk) =>
        chunk.tier <= tier &&
        (chunk.topSpeed ?? 18) >= speed &&
        chunk.name !== this.lastChunk &&
        (!hasPower(chunk) || this.cursor - this.lastPower >= POWER_SPACING),
    );
    // The newest tier is favoured, the older ones keep turning up for rhythm.
    const chunk = this.random.weighted(candidates, (candidate) => candidate.weight * (candidate.tier === tier ? 2 : 1));
    const mirrored = this.random.next() < 0.5;
    const placed = placeChunk(chunk, 0, speed, mirrored);
    const offset = this.cursor + speed * decisionGapSeconds(speed, gentle) - placed.start;
    for (const item of placed.items) item.z += offset;
    this.items.push(...placed.items);
    this.laid.push({ name: chunk.name, start: placed.start + offset, end: placed.end + offset, speed, mirrored });
    if (this.laid.length > 64) this.laid.shift();
    this.cursor = placed.end + offset;
    this.lastChunk = chunk.name;
    if (hasPower(chunk)) this.lastPower = this.cursor;
  }
}
