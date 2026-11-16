// Linked photos for demo listings. Unsplash photos are free to use under the
// Unsplash licence and are meant to be hotlinked from their CDN, so we store
// the URL, not a copy. Only this host is accepted, and only internal
// functions can set it: a browser can't point a listing at any URL it likes.

const ALLOWED_HOST = "images.unsplash.com";

export function isAllowedPhotoUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === ALLOWED_HOST && /^\/photo-[\w-]+$/.test(u.pathname);
  } catch {
    return false;
  }
}

/** Card-sized, cropped and compressed by the CDN (about 40–80 KB). */
export function sizedPhotoUrl(url: string): string {
  return `${url.split("?")[0]}?w=800&h=450&fit=crop&auto=format&q=70`;
}

/** Unsplash photos for the seeded tools, keyed by tool name. */
export const DEMO_PHOTOS: Record<string, string> = {
  "Cordless drill (18V)": "https://images.unsplash.com/photo-1504148455328-c376907d081c",
  "Extension ladder, 5m": "https://images.unsplash.com/photo-1635082627989-dcd12a107364",
  "Hedge trimmer": "https://images.unsplash.com/photo-1543309959-4d45288d1629",
  "Camping stove": "https://images.unsplash.com/photo-1522041350204-22285237eeca",
  "Pressure washer": "https://images.unsplash.com/photo-1782235869457-069673be2dc3",
  "Socket set (40 pc)": "https://images.unsplash.com/photo-1741827866663-6ad8ec20480c",
};
