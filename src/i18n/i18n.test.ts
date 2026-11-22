import { afterEach, describe, expect, it, vi } from 'vitest';
import { en } from './en.js';
import { TABLES, detectLanguage, formatNumber, setBlank, setLanguage, translate, type Language } from './index.js';

const holes = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
const languages = Object.keys(TABLES) as Language[];

describe('string tables (§11)', () => {
  it('ship all eight site languages', () => {
    expect([...languages].sort()).toEqual(['de', 'en', 'es', 'fr', 'ko', 'no', 'pt', 'zh']);
  });

  it.each(languages)('%s has exactly the English keys, each non-empty, with the same placeholders', (language) => {
    const table = TABLES[language];
    expect(Object.keys(table).sort()).toEqual(Object.keys(en).sort());
    for (const [key, value] of Object.entries(table)) {
      expect(value.trim(), `${language}.${key}`).not.toBe('');
      expect(holes(value), `${language}.${key}`).toEqual(holes(en[key as keyof typeof en]));
    }
  });

  it.each(languages.filter((language) => language !== 'en'))('%s is translated, not copied from English', (language) => {
    const copied = Object.entries(TABLES[language]).filter(([key, value]) => value === en[key as keyof typeof en] && !/^[A-Z][a-z]+$/.test(value));
    expect(copied.length, copied.map(([key]) => key).join(', ')).toBeLessThan(4);
  });

  it('never translates the name', () => {
    for (const language of languages) expect(TABLES[language]['aria.game']).toContain('Zoomway');
  });

  it('fills placeholders, formats numbers per language, and can blank every string', () => {
    setLanguage('es');
    expect(translate('aria.fruit', { count: 12 })).toBe('12 mandarinas');
    setLanguage('de');
    expect(formatNumber(12345)).toBe('12.345');
    setBlank(true);
    expect(translate('pause.title')).toBe('');
    setBlank(false);
    setLanguage('en');
  });
});

describe('language detection', () => {
  afterEach(() => vi.unstubAllGlobals());

  const stub = (stored: string | null, browser: string[], throws = false) => {
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => {
        if (throws) throw new Error('sandboxed');
        return key === 'kidtopia:lang' ? stored : null;
      },
    });
    vi.stubGlobal('navigator', { languages: browser, language: browser[0] });
  };

  it("reads the site's kidtopia:lang first", () => {
    stub('ko', ['fr-FR']);
    expect(detectLanguage()).toBe('ko');
  });

  it('then the browser, mapping nb and nn to Norwegian and regions to their language', () => {
    stub(null, ['nb-NO', 'en']);
    expect(detectLanguage()).toBe('no');
    stub(null, ['zh-CN']);
    expect(detectLanguage()).toBe('zh');
    stub('xx', ['ja', 'pt-BR']);
    expect(detectLanguage()).toBe('pt');
  });

  it('then English, and a throwing storage never breaks it', () => {
    stub(null, ['ja-JP']);
    expect(detectLanguage()).toBe('en');
    stub('es', ['fr-CA'], true);
    expect(detectLanguage()).toBe('fr');
  });
});
