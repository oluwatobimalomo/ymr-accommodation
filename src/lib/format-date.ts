export function formatDateOnly(value: string | null | undefined, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" }) {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-NG", { ...options, timeZone: "UTC" }).format(date);
}

export function formatStayRange(checkIn: string | null | undefined, checkOut: string | null | undefined): string | null {
  if (!checkIn || !checkOut) return null;
  const start = new Date(`${checkIn.slice(0, 10)}T00:00:00.000Z`);
  const end = new Date(`${checkOut.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;
  const nights = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  const startDay = start.getUTCDate();
  const endDay = end.getUTCDate();
  const startMonth = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(start);
  const endMonth = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(end);
  const startYear = start.getUTCFullYear();
  const endYear = end.getUTCFullYear();
  const range = startYear !== endYear
    ? `${startDay} ${startMonth} ${startYear}–${endDay} ${endMonth} ${endYear}`
    : start.getUTCMonth() === end.getUTCMonth()
      ? `${startDay}–${endDay} ${endMonth} ${endYear}`
      : `${startDay} ${startMonth}–${endDay} ${endMonth} ${endYear}`;
  return `${range} (${nights} night${nights === 1 ? "" : "s"})`;
}
