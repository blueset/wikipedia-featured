
// Compute today's date in UTC+12, then step backwards if needed
export function getUTCPlus12Now() {
  const now = new Date();
  return new Date(now.getTime() + 12 * 60 * 60 * 1000);
}

export function addDaysUTC(date, deltaDays) {
  return new Date(date.getTime() + deltaDays * 24 * 60 * 60 * 1000);
}

export function formatYMD(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return { y, m, d };
}
