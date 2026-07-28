/** Strip formatting so only digits remain (e.g. 052-632-9311 → 0526329311). */
export function normalizeGuestPhone(raw: unknown): string {
  return String(raw ?? '').replace(/\D/g, '');
}

/** Match guest name or phone against a free-text query. Phone match ignores formatting. */
export function guestMatchesSearch(
  guest: { name?: string | null; phone?: string | null },
  query: string
): boolean {
  const q = String(query || '').trim();
  if (!q) return true;

  const qLower = q.toLowerCase();
  const guestName = String(guest?.name || '').toLowerCase();
  if (guestName.includes(qLower)) return true;

  const qDigits = normalizeGuestPhone(q);
  if (!qDigits) return false;

  return normalizeGuestPhone(guest?.phone).includes(qDigits);
}
