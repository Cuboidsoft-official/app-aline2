import { applyEnglishLocaleDefaults, formatEnglishDate, formatEnglishNumber } from '../src/utils/englishLocale';

describe('englishLocale', () => {
  it('uses English defaults for date formatting', () => {
    applyEnglishLocaleDefaults();
    const date = new Date('2024-03-05T12:00:00Z');
    const expected = new Intl.DateTimeFormat('en-US').format(date);

    expect(date.toLocaleDateString()).toBe(expected);
    expect(formatEnglishDate(date)).toContain('2024');
  });

  it('uses English defaults for number formatting', () => {
    applyEnglishLocaleDefaults();
    const expected = new Intl.NumberFormat('en-US').format(1234567.89);

    expect(Number(1234567.89).toLocaleString()).toBe(expected);
    expect(formatEnglishNumber(1234567.89)).toBe(expected);
  });
});
