export function normalizeBaseUrl(input?: string | null) {
  const raw = String(input ?? '').trim();
  return raw ? raw.replace(/\/+$/, '') : '';
}

export function buildEventLocationText(location?: string | null, city?: string | null) {
  return [String(location ?? '').trim(), String(city ?? '').trim()].filter(Boolean).join(', ');
}

export function buildGuestDirectionsShortLink(baseUrl?: string | null, token?: string | null) {
  const base = normalizeBaseUrl(baseUrl);
  const cleanToken = String(token ?? '').trim();
  if (!base || !cleanToken) return '';
  return `${base}/w/${encodeURIComponent(cleanToken)}`;
}

export function buildDirectionsDetailsText(baseUrl?: string | null, token?: string | null) {
  const shortLink = buildGuestDirectionsShortLink(baseUrl, token);
  return shortLink ? `לניווט ב-Waze: ${shortLink}` : '';
}

export function buildWazeNavigationUrl(location?: string | null, city?: string | null) {
  const destination = buildEventLocationText(location, city);
  if (!destination) return '';
  return `https://www.waze.com/ul?q=${encodeURIComponent(destination)}&navigate=yes`;
}
