/**
 * Returns a short "time ago" string, e.g. "3 min ago", "1 hour ago".
 */
export function getTimeAgo(date: Date): string {
  const now = Date.now();
  const ms = now - date.getTime();
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hour = Math.floor(min / 60);
  const day = Math.floor(hour / 24);

  if (day > 0) return `${day} day${day === 1 ? '' : 's'} ago`;
  if (hour > 0) return `${hour} hour${hour === 1 ? '' : 's'} ago`;
  if (min > 0) return `${min} min ago`;
  if (sec > 0) return `${sec} sec ago`;
  return 'Just now';
}
