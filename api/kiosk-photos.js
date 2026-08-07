/**
 * /api/kiosk-photos — Vercel serverless function.
 *
 * Serves the current contents of one of two OneDrive folders (Kiosk
 * Backgrounds / Kiosk Slideshow) for the /kiosk wall display. The Microsoft
 * Graph refresh token stays server-side; the browser never talks to
 * Microsoft directly. Set up once via scripts/get-onedrive-token.mjs.
 *
 * (Originally built against the Google Photos Library API, but Google
 * discontinued the shared-album-join scopes this relied on in 2025 — see
 * git history. OneDrive/Graph has no such restriction: it reads a folder's
 * children by path directly, no "join" step, no album API at all.)
 *
 * GET /api/kiosk-photos?album=backgrounds|slideshow
 * -> { photos: [{ id, url, width, height }] }
 *
 * url is a Microsoft-signed direct download link, short-lived (a few
 * hours) — fine for a display that polls every 10 minutes.
 *
 * Environment variables (Vercel project settings):
 *   MS_CLIENT_ID
 *   MS_CLIENT_SECRET
 *   MS_REFRESH_TOKEN
 *   ONEDRIVE_BACKGROUNDS_FOLDER   (e.g. "Kiosk Backgrounds")
 *   ONEDRIVE_SLIDESHOW_FOLDER     (e.g. "Kiosk Slideshow")
 */

const FOLDER_ENV = {
  backgrounds: 'ONEDRIVE_BACKGROUNDS_FOLDER',
  slideshow: 'ONEDRIVE_SLIDESHOW_FOLDER',
};

// Must match the /consumers/ authority used by scripts/get-onedrive-token.mjs
// — the app is registered "Personal Microsoft accounts only".
const TOKEN_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';

async function getAccessToken() {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID,
      client_secret: process.env.MS_CLIENT_SECRET,
      refresh_token: process.env.MS_REFRESH_TOKEN,
      grant_type: 'refresh_token',
      scope: 'offline_access Files.Read',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function listFolderPhotos(accessToken, folderName) {
  // Path-based addressing — no folder id lookup needed, just the name.
  const encodedPath = folderName.split('/').map(encodeURIComponent).join('/');
  const listUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${encodedPath}:/children?$select=id,name,file,image`;
  const res = await fetch(listUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(`Folder fetch failed: ${JSON.stringify(data)}`);
  const items = (data.value ?? []).filter((item) => item.image);

  // @microsoft.graph.downloadUrl doesn't come back via $select at all on
  // this drive (confirmed live — neither the listing nor a per-item GET
  // includes it). The reliable alternative: GET /items/{id}/content
  // redirects (302) to the real signed download URL — read it straight off
  // the Location header without following the redirect.
  const itemResults = await Promise.all(items.map(async (item) => {
    const contentRes = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${item.id}/content`,
      { headers: { Authorization: `Bearer ${accessToken}` }, redirect: 'manual' }
    );
    return { id: item.id, image: item.image, status: contentRes.status, url: contentRes.headers.get('location') };
  }));

  const photos = itemResults
    .filter((r) => r.url)
    .map((r) => ({
      id: r.id,
      url: r.url,
      width: r.image?.width ?? null,
      height: r.image?.height ?? null,
    }));
  return {
    photos,
    rawCount: items.length,
    sample: items.slice(0, 3).map((i) => ({ name: i.name, keys: Object.keys(i) })),
    itemSample: itemResults.slice(0, 2).map((r) => ({ status: r.status, hasUrl: Boolean(r.url) })),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const album = String(req.query.album || '');
  const envKey = FOLDER_ENV[album];
  if (!envKey) {
    res.status(400).json({ error: `album must be one of: ${Object.keys(FOLDER_ENV).join(', ')}` });
    return;
  }

  const folderName = process.env[envKey];
  if (!folderName || !process.env.MS_CLIENT_ID || !process.env.MS_CLIENT_SECRET || !process.env.MS_REFRESH_TOKEN) {
    res.status(500).json({ error: `OneDrive isn't configured yet (missing ${envKey} or Graph env vars). See scripts/get-onedrive-token.mjs.` });
    return;
  }

  try {
    const accessToken = await getAccessToken();
    const { photos, rawCount, sample, itemSample } = await listFolderPhotos(accessToken, folderName);
    res.setHeader('Cache-Control', 'no-store');
    if (req.query.debug === '1') {
      res.status(200).json({ photos, debug: { folderName, rawCount, sample, itemSample } });
      return;
    }
    res.status(200).json({ photos });
  } catch (e) {
    res.status(502).json({ error: 'Could not read the OneDrive folder.', detail: String(e).slice(0, 300) });
  }
}
