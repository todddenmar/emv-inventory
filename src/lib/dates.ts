/** Local calendar date as `YYYY-MM-DD` for `<input type="date">`. */
export function toDateInputValue(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function startOfLocalDay(dateInput: string): Date {
  const [y, m, d] = dateInput.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export function endOfLocalDay(dateInput: string): Date {
  const [y, m, d] = dateInput.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999);
}

export function shiftDateInput(dateInput: string, days: number): string {
  const date = startOfLocalDay(dateInput);
  date.setDate(date.getDate() + days);
  return toDateInputValue(date);
}

/** Inclusive day count between two `YYYY-MM-DD` values. */
export function inclusiveDayCount(fromDate: string, toDate: string): number {
  const from = startOfLocalDay(fromDate).getTime();
  const to = startOfLocalDay(toDate).getTime();
  return Math.max(1, Math.round((to - from) / 86_400_000) + 1);
}

/** Period immediately before `[fromDate, toDate]` with the same length. */
export function previousPeriodRange(
  fromDate: string,
  toDate: string
): { fromDate: string; toDate: string } {
  const days = inclusiveDayCount(fromDate, toDate);
  const prevTo = shiftDateInput(fromDate, -1);
  const prevFrom = shiftDateInput(prevTo, -(days - 1));
  return { fromDate: prevFrom, toDate: prevTo };
}

export function formatDateInputLabel(dateInput: string): string {
  try {
    const [y, m, d] = dateInput.split("-").map(Number);
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
      new Date(y, m - 1, d)
    );
  } catch {
    return dateInput;
  }
}

export function eachDateInRange(fromDate: string, toDate: string): string[] {
  const dates: string[] = [];
  let cursor = fromDate;
  const end = startOfLocalDay(toDate).getTime();
  while (startOfLocalDay(cursor).getTime() <= end) {
    dates.push(cursor);
    cursor = shiftDateInput(cursor, 1);
  }
  return dates;
}

/** Calendar month key `YYYY-MM`. */
export function toMonthKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return monthKey;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
  }).format(new Date(y, m - 1, 1));
}

export function startOfMonthDateInput(monthKey: string): string {
  return `${monthKey}-01`;
}

export function endOfMonthDateInput(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${monthKey}-${String(lastDay).padStart(2, "0")}`;
}

export function shiftMonthKey(monthKey: string, months: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const date = new Date(y, m - 1 + months, 1);
  return toMonthKey(date);
}

/** Inclusive list of month keys from `fromMonth` through `toMonth` (`YYYY-MM`). */
export function eachMonthInRange(
  fromMonth: string,
  toMonth: string
): string[] {
  const months: string[] = [];
  let cursor = fromMonth;
  while (cursor <= toMonth) {
    months.push(cursor);
    cursor = shiftMonthKey(cursor, 1);
  }
  return months;
}

/** First day of the month that is `monthsBack` months before today (0 = this month). */
export function firstDayMonthsAgo(monthsBack: number, now = new Date()): string {
  const monthKey = shiftMonthKey(toMonthKey(now), -monthsBack);
  return startOfMonthDateInput(monthKey);
}
