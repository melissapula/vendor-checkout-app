// Sanity's CDN accepts on-the-fly resize params, so callers can request a
// small thumbnail instead of the full-resolution site image.
export function thumbUrl(url: string, size = 112): string {
  return `${url}?w=${size}&h=${size}&fit=crop&auto=format`;
}
