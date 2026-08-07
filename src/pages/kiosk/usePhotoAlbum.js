import { useState, useEffect, useCallback } from 'react';

// Polls /api/kiosk-photos for one of the two OneDrive folders (see
// api/kiosk-photos.js). Microsoft's download URLs are signed for a few
// hours, so a 10-minute poll keeps well ahead of expiry without hammering
// the Graph API.
const POLL_MS = 10 * 60 * 1000;

export function usePhotoAlbum(album) {
  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/kiosk-photos?album=${album}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load photos');
      setPhotos(data.photos ?? []);
      setError(null);
    } catch (e) {
      // Leave whatever photos we already have — a flaky poll shouldn't blank
      // the display. Only surface the error if we have nothing to show yet.
      setError(String(e));
    }
  }, [album]);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  return { photos, error };
}
