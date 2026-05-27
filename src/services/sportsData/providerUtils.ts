export const SPORTS_REQUEST_TIMEOUT_MS = 10_000;

export const normalizeComparableText = (value?: string) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

export const teamsMatch = (
  expectedHome?: string,
  expectedAway?: string,
  actualHome?: string,
  actualAway?: string,
) => {
  const home = normalizeComparableText(expectedHome);
  const away = normalizeComparableText(expectedAway);
  const candidateHome = normalizeComparableText(actualHome);
  const candidateAway = normalizeComparableText(actualAway);
  if (!home || !away || !candidateHome || !candidateAway) return false;
  return (candidateHome.includes(home) || home.includes(candidateHome))
    && (candidateAway.includes(away) || away.includes(candidateAway));
};

export const requestJson = async <T>(
  url: URL,
  headers: HeadersInit = {},
): Promise<T | null> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SPORTS_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};

export const compactArray = <T>(items: T[] | undefined, limit = 5) =>
  Array.isArray(items) ? items.slice(0, limit) : undefined;
