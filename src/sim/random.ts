// A seeded generator per run (§12): mulberry32. Same seed, same boardwalk.

export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  /** Uniform in [0, 1). */
  next(): number {
    let mixed = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  }

  /** Pick by weight; the weights must not all be zero. */
  weighted<Item>(items: readonly Item[], weight: (item: Item) => number): Item {
    let total = 0;
    for (const item of items) total += weight(item);
    let remaining = this.next() * total;
    for (const item of items) {
      remaining -= weight(item);
      if (remaining < 0) return item;
    }
    return items[items.length - 1]!;
  }
}

export function freshSeed(): number {
  return (Math.random() * 4294967296) >>> 0;
}

/** A stable 0..1 hash of a position, for scenery that must look the same every visit. */
export function hashPosition(position: number, salt: number): number {
  let mixed = Math.imul((position | 0) ^ Math.imul(salt + 0x27d4eb2d, 0x165667b1), 0x9e3779b1);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x85ebca77);
  mixed ^= mixed >>> 13;
  return (mixed >>> 0) / 4294967296;
}
