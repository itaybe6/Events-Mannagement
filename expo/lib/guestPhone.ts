/** Strip formatting so only digits remain (e.g. 052-632-9311 → 0526329311). */
export function normalizeGuestPhone(raw: unknown): string {
  return String(raw ?? '').replace(/\D/g, '');
}

/**
 * Canonical digits for Israeli-aware search.
 * Drops formatting, international 00, country code 972, and a leading 0 so
 * +97252632-9311, 972-52-632-9311 and 0526329311 all become 526329311.
 */
export function phoneSearchKey(raw: unknown): string {
  let digits = normalizeGuestPhone(raw);
  if (!digits) return '';

  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('972') && digits.length > 3) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

/** Match guest name or phone against a free-text query. Phone match ignores formatting and 972/0 prefixes. */
export function guestMatchesSearch(
  guest: { name?: string | null; phone?: string | null },
  query: string
): boolean {
  const q = String(query || '').trim();
  if (!q) return true;

  const qLower = q.toLowerCase();
  const guestName = String(guest?.name || '').toLowerCase();
  if (guestName.includes(qLower)) return true;

  const qKey = phoneSearchKey(q);
  if (!qKey) return false;

  return phoneSearchKey(guest?.phone).includes(qKey);
}
