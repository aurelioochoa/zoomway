import { describe, expect, it } from 'vitest';
import { SAVE_KEY, freshSave, loadSave, parseSave, recordRun, serializeSave, writeSave } from './save.js';

describe('save parsing (§12)', () => {
  it('starts fresh with nothing stored', () => {
    expect(parseSave(null).save).toEqual(freshSave());
  });

  it('round-trips every field', () => {
    const loaded = parseSave(null);
    Object.assign(loaded.save, { best: 812, bestGentle: 300, bestFruit: 41, hat: 3, skates: 2, muted: true, music: false, reducedMotion: true, gentle: true });
    loaded.save.hints.slide = true;
    expect(parseSave(serializeSave(loaded)).save).toEqual(loaded.save);
  });

  it('falls back field by field and keeps the best when the rest is nonsense', () => {
    const { save } = parseSave(JSON.stringify({ v: 1, best: 640, hat: 99, skates: 'red', music: 'yes', hints: 4, bestFruit: -3 }));
    expect(save.best).toBe(640);
    expect(save.hat).toBe(0);
    expect(save.skates).toBe(0);
    expect(save.music).toBe(true);
    expect(save.bestFruit).toBe(0);
    expect(save.hints.slide).toBe(false);
  });

  it('rescues the distances from a corrupt save', () => {
    const { save } = parseSave('{"v":1,"best":1234,"bestGentle":77,"hat":2,"mus');
    expect(save.best).toBe(1234);
    expect(save.bestGentle).toBe(77);
    expect(save.hat).toBe(0);
  });

  it('reads what it knows of a newer save and writes its unknown fields back untouched', () => {
    const loaded = parseSave(JSON.stringify({ v: 3, best: 900, rainbowTrail: true, hints: { slide: true } }));
    expect(loaded.save.best).toBe(900);
    expect(loaded.save.hints.slide).toBe(true);
    const written = JSON.parse(serializeSave(loaded));
    expect(written).toMatchObject({ v: 3, rainbowTrail: true, best: 900 });
  });

  it('plays on when storage is missing or throws', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const loaded = loadSave(throwing);
    expect(loaded.save).toEqual(freshSave());
    expect(() => writeSave(loaded, throwing)).not.toThrow();
    expect(loadSave(null).save).toEqual(freshSave());
  });

  it('writes under the one versioned key', () => {
    const stored = new Map<string, string>();
    const store = { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => void stored.set(key, value) };
    const loaded = loadSave(store);
    loaded.save.best = 50;
    writeSave(loaded, store);
    expect(JSON.parse(stored.get(SAVE_KEY)!)).toMatchObject({ v: 1, best: 50 });
  });
});

describe('recording a run (§5, §D)', () => {
  it('keeps separate bests for normal and Gentle and the most fruit in one run', () => {
    const save = freshSave();
    expect(recordRun(save, false, 120.7, 9)).toBe(true);
    expect(recordRun(save, false, 100, 30)).toBe(false);
    expect(recordRun(save, true, 80, 2)).toBe(true);
    expect(save).toMatchObject({ best: 120, bestGentle: 80, bestFruit: 30 });
  });
});
