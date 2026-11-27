// Calendar helpers in the team's time zone (default Europe/Berlin).

/** Local calendar date (YYYY-MM-DD) of the given instant in the given time zone. */
export function localDate(at: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

/** Monday (YYYY-MM-DD) of the ISO week containing the given instant, in the given time zone. */
export function weekStart(at: Date, timeZone: string): string {
  const [y, m, d] = localDate(at, timeZone).split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  const weekday = (day.getUTCDay() + 6) % 7; // Monday = 0
  day.setUTCDate(day.getUTCDate() - weekday);
  return day.toISOString().slice(0, 10);
}
