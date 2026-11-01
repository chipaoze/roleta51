function utcDay(dayKey) {
  return new Date(`${dayKey}T12:00:00Z`);
}

export function isDailyDutyWorkday(dayKey) {
  const date = utcDay(dayKey);
  const weekday = date.getUTCDay();
  return weekday >= 1 && weekday <= 5;
}

export function previousDailyDutyWorkday(dayKey) {
  const date = utcDay(dayKey);
  do date.setUTCDate(date.getUTCDate() - 1);
  while (!isDailyDutyWorkday(date.toISOString().slice(0, 10)));
  return date.toISOString().slice(0, 10);
}
