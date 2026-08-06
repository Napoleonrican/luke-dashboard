/**
 * /api/kiosk-photos — Vercel serverless function.
 *
 * Serves the current contents of one of two Google Photos shared albums
 * (Kiosk Backgrounds / Kiosk Slideshow) for the /kiosk wall display. The
 * OAuth refresh token stays server-side; the browser never talks to Google
 * directly. Set up once via scripts/get-google-photos-token.mjs.
 *
 * GET /api/kiosk-photos?album=backgrounds|slideshow
 * -> { photos: [{ id, baseUrl, width, height }] }
 *
 * baseUrl is a Google-signed image URL good for a few hours — append e.g.
 * "=w1920-h1080" for a sized fetch, per the Photos Library API docs.
 *
 * Environment variables (Vercel project settings):
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   GOOGLE_REFRESH_TOKEN
 *   GOOGLE_PHOTOS_BACKGROUNDS_ALBUM_ID
 *   GOOGLE_PHOTOS_SLIDESHOW_ALBUM_ID
 */

const ALBUM_ENV = {
  backgrounds: 'GOOGLE_PHOTOS_BACKGROUNDS_ALBUM_ID',
  slideshow: 'GOOGLE_PHOTOS_SLIDESHOW_ALBUM_ID',
};

async function getAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function listAlbumPhotos(accessToken, albumId) {
  const res = await fetch('https://photoslibrary.googleapis.com/v1/mediaItems:search', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ albumId, pageSize: 100 }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Album fetch failed: ${JSON.stringify(data)}`);
  return (data.mediaItems ?? [])
    .filter((m) => m.mimeType?.startsWith('image/'))
    .map((m) => ({
      id: m.id,
      baseUrl: m.baseUrl,
      width: Number(m.mediaMetadata?.width) || null,
      height: Number(m.mediaMetadata?.height) || null,
    }));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const album = String(req.query.album || '');
  const envKey = ALBUM_ENV[album];
  if (!envKey) {
    res.status(400).json({ error: `album must be one of: ${Object.keys(ALBUM_ENV).join(', ')}` });
    return;
  }

  const albumId = process.env[envKey];
  if (!albumId || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REFRESH_TOKEN) {
    res.status(500).json({ error: `Google Photos isn't configured yet (missing ${envKey} or OAuth env vars). See scripts/get-google-photos-token.mjs.` });
    return;
  }

  try {
    const accessToken = await getAccessToken();
    const photos = await listAlbumPhotos(accessToken, albumId);
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).json({ photos });
  } catch (e) {
    res.status(502).json({ error: 'Could not read the Google Photos album.', detail: String(e).slice(0, 300) });
  }
}
