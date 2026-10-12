// Sanity's CDN accepts on-the-fly resize params, so callers can request a
// small thumbnail instead of the full-resolution site image. Any other
// host gets its URL back untouched — a vendor can paste an image link from
// anywhere, and tacking Sanity's params onto one that already has its own
// query string would produce a broken address.
export function thumbUrl(url: string, size = 112): string {
  if (!url.includes('cdn.sanity.io') || url.includes('?')) return url;
  return `${url}?w=${size}&h=${size}&fit=crop&auto=format`;
}
