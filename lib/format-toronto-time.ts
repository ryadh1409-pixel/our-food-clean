import type { Timestamp } from 'firebase/firestore';

function toDate(value: Timestamp | Date | number): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  return (value as Timestamp).toDate();
}

export function formatTorontoTime(
  timestamp: Timestamp | Date | number | null | undefined,
): string {
  if (timestamp == null) return '—';
  const d = toDate(timestamp);
  return d.toLocaleString('en-CA', {
    timeZone: 'America/Toronto',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatTorontoOrderTime(
  timestamp: Timestamp | Date | number | null | undefined,
): string {
  if (timestamp == null) return '—';
  const d = toDate(timestamp);
  const today = new Date();
  const dateStr = d.toLocaleDateString('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const todayStr = today.toLocaleDateString('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const timeStr = formatTorontoTime(timestamp);
  return dateStr === todayStr ? `Today ${timeStr}` : `${dateStr} ${timeStr}`;
}

/** Format as MMM DD, YYYY in America/Toronto */
export function formatTorontoDate(
  timestamp: Timestamp | Date | number | null | undefined,
): string {
  if (timestamp == null) return '—';
  const d = toDate(timestamp);
  return d.toLocaleDateString('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Format as HH:mm (24h) in America/Toronto */
export function formatTorontoTimeHHMM(
  timestamp: Timestamp | Date | number | null | undefined,
): string {
  if (timestamp == null) return '—';
  const d = toDate(timestamp);
  return d.toLocaleTimeString('en-CA', {
    timeZone: 'America/Toronto',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
