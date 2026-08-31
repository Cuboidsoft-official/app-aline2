export function applyEnglishLocaleDefaults(): void {
  // No-op or global locale setup if needed
}

export function formatEnglishDate(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat("en-US").format(d);
}

export function formatEnglishNumber(num: number): string {
  return new Intl.NumberFormat("en-US").format(num);
}
