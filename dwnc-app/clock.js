// Every product date/time is a Korean wall-clock value, regardless of host TZ.
const koreanDate = new Intl.DateTimeFormat('en', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
});
const koreanTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function koreaToday(date = new Date()) {
  const parts = Object.fromEntries(koreanDate.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function koreaTime(date = new Date()) { return koreanTime.format(date); }

// A YYYY-MM-DD value is a calendar date, not an instant in the host timezone.
export function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
