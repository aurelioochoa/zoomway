// The save (§12): one versioned key, `zoomway:save`, read field by field so that anything
// broken falls back on its own and the best distance survives whenever it can be read at
// all. Storage can be missing or throw (a sandboxed frame, a full quota): the game then
// plays on without remembering. A save from a newer version keeps its unknown fields.

export const SAVE_KEY = 'zoomway:save';
export const SAVE_VERSION = 1;
export const HATS = ['tangerine', 'lemon', 'strawberry', 'apple', 'pear'] as const;
export const SKATES = ['teal', 'coral', 'sunny', 'lavender', 'lime'] as const;

export interface Save {
  best: number;
  bestGentle: number;
  bestFruit: number;
  hat: number;
  skates: number;
  muted: boolean;
  music: boolean;
  /** null follows the system's prefers-reduced-motion (§D). */
  reducedMotion: boolean | null;
  gentle: boolean;
  hints: { slide: boolean };
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export function freshSave(): Save {
  return {
    best: 0,
    bestGentle: 0,
    bestFruit: 0,
    hat: 0,
    skates: 0,
    muted: false,
    music: true,
    reducedMotion: null,
    gentle: false,
    hints: { slide: false },
  };
}

const distanceField = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
const choiceField = (value: unknown, count: number) =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) < count ? (value as number) : 0;
const flagField = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);

export interface Loaded {
  save: Save;
  /** Fields this version does not know, kept so writing never destroys a newer save. */
  extras: Record<string, unknown>;
  version: number;
}

export function parseSave(raw: string | null): Loaded {
  const save = freshSave();
  if (!raw) return { save, extras: {}, version: SAVE_VERSION };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    // Corrupt: rescue the distances if their digits are still legible, drop the rest.
    for (const key of ['best', 'bestGentle', 'bestFruit'] as const) {
      const match = new RegExp(`"${key}"\\s*:\\s*(\\d+)`).exec(raw);
      if (match) save[key] = Number(match[1]);
    }
    return { save, extras: {}, version: SAVE_VERSION };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return { save, extras: {}, version: SAVE_VERSION };
  const record = data as Record<string, unknown>;
  save.best = distanceField(record.best, 0);
  save.bestGentle = distanceField(record.bestGentle, 0);
  save.bestFruit = distanceField(record.bestFruit, 0);
  save.hat = choiceField(record.hat, HATS.length);
  save.skates = choiceField(record.skates, SKATES.length);
  save.muted = flagField(record.muted, false);
  save.music = flagField(record.music, true);
  save.reducedMotion = typeof record.reducedMotion === 'boolean' ? record.reducedMotion : null;
  save.gentle = flagField(record.gentle, false);
  const hints = record.hints as Record<string, unknown> | null;
  save.hints.slide = flagField(hints?.slide, false);
  const known = new Set([...Object.keys(freshSave()), 'v']);
  const extras = Object.fromEntries(Object.entries(record).filter(([key]) => !known.has(key)));
  const version = typeof record.v === 'number' && record.v > SAVE_VERSION ? record.v : SAVE_VERSION;
  return { save, extras, version };
}

export function serializeSave(loaded: Loaded): string {
  return JSON.stringify({ ...loaded.extras, ...loaded.save, v: loaded.version });
}

function storage(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadSave(store: Store | null = storage()): Loaded {
  try {
    return parseSave(store?.getItem(SAVE_KEY) ?? null);
  } catch {
    return parseSave(null);
  }
}

export function writeSave(loaded: Loaded, store: Store | null = storage()): void {
  try {
    store?.setItem(SAVE_KEY, serializeSave(loaded));
  } catch {
    // Quota or a sandbox: the game plays on without remembering.
  }
}

/** Record a finished (or abandoned) run. Returns true for a new best distance. */
export function recordRun(save: Save, gentle: boolean, distance: number, fruit: number): boolean {
  const meters = Math.floor(distance);
  save.bestFruit = Math.max(save.bestFruit, fruit);
  if (gentle ? meters <= save.bestGentle : meters <= save.best) return false;
  if (gentle) save.bestGentle = meters;
  else save.best = meters;
  return true;
}
