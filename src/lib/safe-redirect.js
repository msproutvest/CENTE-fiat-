export const DEFAULT_ALLOWED_HOSTS = ['gocente.com'];
export const DEFAULT_REDIRECT = 'https://app.gocente.com';

/**
 * Returns `url` only if it is https and its host is (a subdomain of) an allowed host.
 * Anything else falls back to the default, so a query-string/data-attribute value
 * can never send the user to an arbitrary site.
 */
export function safeRedirectUrl(
  url,
  allowedHosts = DEFAULT_ALLOWED_HOSTS,
  fallback = DEFAULT_REDIRECT
) {
  if (!url || typeof url !== 'string') return fallback;
  try {
    const u = new URL(url, window.location.origin);
    if (u.protocol !== 'https:') return fallback;
    const host = u.hostname.toLowerCase();
    const ok = (allowedHosts || DEFAULT_ALLOWED_HOSTS).some((h) => {
      const allowed = String(h).toLowerCase();
      return host === allowed || host.endsWith('.' + allowed);
    });
    return ok ? u.toString() : fallback;
  } catch {
    return fallback;
  }
}
