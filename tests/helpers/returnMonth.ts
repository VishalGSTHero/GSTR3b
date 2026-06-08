const MONTH_ABBREVS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Previous calendar month (e.g. May when run in June). Override with GSTHERO_RETURN_MONTH. */
export function getReturnMonth(): string {
  const fromEnv = process.env.GSTHERO_RETURN_MONTH?.trim();
  if (fromEnv) return fromEnv;

  const now = new Date();
  const previousMonthIndex = (now.getMonth() + 11) % 12;
  return MONTH_ABBREVS[previousMonthIndex];
}
