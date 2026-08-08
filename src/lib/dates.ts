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
