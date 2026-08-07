#!/usr/bin/env node
/**
 * rotate-kiosk-photos.mjs — curates the /kiosk display's photo pool.
 *
 * Runs on a schedule (GitHub Actions, see .github/workflows/rotate-kiosk-photos.yml —
 * NOT Vercel; this is a standalone script, not a serverless function, so it can run
 * as long as it needs to and isn't bound by Vercel's per-invocation timeout).
 *
 * Reads a source folder ("Kiosk Camera Roll" — point your phone's OneDrive camera
 * backup at it), curates new photos, and copies keepers into the two folders
 * api/kiosk-photos.js already serves ("Kiosk Backgrounds" / "Kiosk Slideshow").
 * Photos that have been in Backgrounds/Slideshow too long get aged out to an
 * Archive folder (moved, never deleted).
 *
 * Curation is two passes:
 *   1. Free heuristics — reject screenshots (filename/aspect-ratio patterns),
 *      low-resolution images, and non-image files. No API calls.
 *   2. Claude vision (Haiku) on what survives pass 1 — asks for a keep/reject
 *      verdict plus "backgrounds" vs "slideshow" placement, using OneDrive's
 *      pre-generated small thumbnail (not the full photo) to keep it cheap.
 *
 * All state (which photos have been processed, when each kept photo was added)
 * lives in a single JSON file written back to OneDrive (KIOSK_STATE_FILE) — the
 * script is otherwise stateless, so nothing needs to persist across GitHub
 * Actions runs except that one file.
 *
 * Requires a refresh token with Files.ReadWrite (not just Files.Read like the
 * kiosk-photos.js token) — re-run scripts/get-onedrive-token.mjs after the scope
 * change in that script to mint one.
 *
 * Environment variables:
 *   MS_CLIENT_ID, MS_CLIENT_SECRET, MS_REFRESH_TOKEN   — Graph auth (Files.ReadWrite)
 *   ANTHROPIC_API_KEY                                  — for the vision pass
 *   ONEDRIVE_CAMERA_FOLDER      (default "Kiosk Camera Roll")
 *   ONEDRIVE_BACKGROUNDS_FOLDER (default "Kiosk Backgrounds")
 *   ONEDRIVE_SLIDESHOW_FOLDER   (default "Kiosk Slideshow")
 *   ONEDRIVE_ARCHIVE_FOLDER     (default "Kiosk Archive")
 *   KIOSK_STATE_FILE            (default "kiosk-state.json", stored at OneDrive root)
 *   KIOSK_MAX_AGE_DAYS          (default 45 — how long a photo stays in rotation)
 *   KIOSK_MAX_SLIDESHOW         (default 150 — cap; oldest ages out first if exceeded)
 *   KIOSK_MAX_BACKGROUNDS       (default 40)
 *   KIOSK_DRY_RUN               ("1" to log decisions without writing anything)
 *
 * Usage: node scripts/rotate-kiosk-photos.mjs
 */

const TOKEN_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
const GRAPH = 'https://graph.microsoft.com/v1.0';

const CAMERA_FOLDER = process.env.ONEDRIVE_CAMERA_FOLDER || 'Kiosk Camera Roll';
const BACKGROUNDS_FOLDER = process.env.ONEDRIVE_BACKGROUNDS_FOLDER || 'Kiosk Backgrounds';
const SLIDESHOW_FOLDER = process.env.ONEDRIVE_SLIDESHOW_FOLDER || 'Kiosk Slideshow';
const ARCHIVE_FOLDER = process.env.ONEDRIVE_ARCHIVE_FOLDER || 'Kiosk Archive';
const STATE_FILE = process.env.KIOSK_STATE_FILE || 'kiosk-state.json';
const MAX_AGE_DAYS = Number(process.env.KIOSK_MAX_AGE_DAYS || 45);
const MAX_SLIDESHOW = Number(process.env.KIOSK_MAX_SLIDESHOW || 150);
const MAX_BACKGROUNDS = Number(process.env.KIOSK_MAX_BACKGROUNDS || 40);
const DRY_RUN = process.env.KIOSK_DRY_RUN === '1';

const SCREENSHOT_NAME_RE = /screenshot|screen shot|whatsapp image|img_\d+_wa/i;
const MIN_DIMENSION = 800; // reject anything smaller on its longest side

function assertEnv() {
  const missing = ['MS_CLIENT_ID', 'MS_CLIENT_SECRET', 'MS_REFRESH_TOKEN', 'ANTHROPIC_API_KEY']
    .filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Missing required env vars: ${missing.join(', ')}`);
    process.exit(1);
  }
}

async function getAccessToken() {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID,
      client_secret: process.env.MS_CLIENT_SECRET,
      refresh_token: process.env.MS_REFRESH_TOKEN,
      grant_type: 'refresh_token',
      scope: 'offline_access Files.ReadWrite',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

function graphHeaders(token, extra) {
  return { Authorization: `Bearer ${token}`, ...extra };
}

async function graphJson(token, path, options = {}) {
  const res = await fetch(`${GRAPH}${path}`, {
    ...options,
    headers: graphHeaders(token, { 'Content-Type': 'application/json', ...(options.headers || {}) }),
  });
  if (res.status === 404) return null;
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`Graph ${options.method || 'GET'} ${path} failed: ${JSON.stringify(data)}`);
  return data;
}

async function ensureFolder(token, name) {
  // Root-level folder, created if missing (idempotent via @microsoft.graph.conflictBehavior).
  await graphJson(token, '/me/drive/root/children', {
    method: 'POST',
    body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
  }).catch(() => null); // already exists -> ignore
}

async function listFolder(token, folderName) {
  const encoded = folderName.split('/').map(encodeURIComponent).join('/');
  const data = await graphJson(
    token,
    `/me/drive/root:/${encoded}:/children?$select=id,name,file,image,size,createdDateTime&$top=999`
  );
  return data?.value ?? [];
}

async function getFolderId(token, folderName) {
  const encoded = folderName.split('/').map(encodeURIComponent).join('/');
  const data = await graphJson(token, `/me/drive/root:/${encoded}`);
  if (!data) throw new Error(`Folder not found: ${folderName}`);
  return data.id;
}

async function readState(token) {
  const data = await graphJson(token, `/me/drive/root:/${encodeURIComponent(STATE_FILE)}:/content`);
  if (data) return data;
  return { processedIds: {}, placedItems: {} };
  // processedIds: { [sourceItemId]: true }
  // placedItems: { [copiedItemId]: { folder: 'backgrounds'|'slideshow', addedAt: iso } }
}

async function writeState(token, state) {
  if (DRY_RUN) { console.log('[dry-run] would write state', summarizeState(state)); return; }
  const res = await fetch(
    `${GRAPH}/me/drive/root:/${encodeURIComponent(STATE_FILE)}:/content`,
    { method: 'PUT', headers: graphHeaders(token, { 'Content-Type': 'application/json' }), body: JSON.stringify(state, null, 2) }
  );
  if (!res.ok) throw new Error(`Failed to write state file: ${await res.text()}`);
}

function summarizeState(state) {
  return { processed: Object.keys(state.processedIds).length, placed: Object.keys(state.placedItems).length };
}

// --- Pass 1: free heuristics ---
function passesHeuristics(item) {
  if (!item.file || !item.image) return false; // not an image
  if (SCREENSHOT_NAME_RE.test(item.name)) return false;
  const w = item.image.width ?? 0;
  const h = item.image.height ?? 0;
  if (Math.max(w, h) < MIN_DIMENSION) return false;
  return true;
}

// --- Pass 2: Claude vision verdict, using OneDrive's small thumbnail ---
async function getThumbnailBase64(token, itemId) {
  const data = await graphJson(token, `/me/drive/items/${itemId}/thumbnails/0`);
  const thumbUrl = data?.medium?.url || data?.large?.url;
  if (!thumbUrl) return null;
  const res = await fetch(thumbUrl);
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return { base64: buf.toString('base64'), mediaType: res.headers.get('content-type') || 'image/jpeg' };
}

async function askClaudeVision(name, imageBase64, mediaType) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system:
        'You curate photos for a home wall-display "memories" slideshow, like an Amazon Echo Show — ' +
        'this display is visible to anyone in the room, including guests and kids. ' +
        'RULE ZERO, above all else: reject ANY photo that is not clearly safe-for-work / family-friendly. ' +
        'This means: any nudity or partial nudity, swimwear/underwear shots where the framing is suggestive ' +
        'rather than incidental (e.g. a beach/pool candid is fine; a posed suggestive shot is not), sexual ' +
        'content or context, and anything else that would be uncomfortable if a coworker, in-law, or child ' +
        'saw it on the wall unannounced. If you have ANY doubt about a photo\'s appropriateness, reject it — ' +
        'a missed good photo costs nothing, a bad one showing up on the wall is the failure mode to avoid. ' +
        'Judge based on the actual image content, not the filename. ' +
        'Beyond that safety rule, also reject: blurry/low-quality shots, ' +
        'documents/receipts/screenshots/memes/whiteboards, food/product photos with no people or scene, ' +
        'duplicates-looking burst shots, and anything that reads as clutter rather than a memory or a nice shot. ' +
        'Keep: photos of people, pets, events, trips, nice landscapes/scenery. ' +
        'If keeping, also decide "backgrounds" (wide/landscape-orientation, high visual quality, few/no ' +
        'close-up faces — good as an ambient wallpaper) vs "slideshow" (everything else worth keeping). ' +
        'Respond with ONLY compact JSON: {"keep": true|false, "placement": "backgrounds"|"slideshow", "reason": "few words"}. ' +
        'If rejected for the safety rule specifically, set "reason" to exactly "not appropriate for display".',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: `Filename: ${name}` },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Claude vision call failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  try {
    const match = text.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : text);
  } catch {
    console.warn(`Could not parse Claude verdict for ${name}: ${text.slice(0, 200)}`);
    return { keep: false, reason: 'unparseable verdict' };
  }
}

async function copyItem(token, itemId, itemName, destFolderId) {
  if (DRY_RUN) { console.log(`[dry-run] would copy ${itemName} -> folder ${destFolderId}`); return `dry-run-${itemId}`; }
  const res = await fetch(`${GRAPH}/me/drive/items/${itemId}/copy`, {
    method: 'POST',
    headers: graphHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ parentReference: { id: destFolderId }, name: itemName }),
  });
  if (res.status !== 202) throw new Error(`Copy failed for ${itemName}: ${res.status} ${await res.text()}`);
  // Graph copy is async (monitor URL in Location header); the item shows up in the
  // dest folder shortly after. We don't block on the monitor endpoint here — the
  // photo will be picked up as "placed" in state and verified/aged on the next run.
  return null;
}

async function moveItem(token, itemId, itemName, destFolderId) {
  if (DRY_RUN) { console.log(`[dry-run] would move ${itemName} -> folder ${destFolderId}`); return; }
  await graphJson(token, `/me/drive/items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify({ parentReference: { id: destFolderId } }),
  });
}

async function main() {
  assertEnv();
  const token = await getAccessToken();

  for (const name of [CAMERA_FOLDER, BACKGROUNDS_FOLDER, SLIDESHOW_FOLDER, ARCHIVE_FOLDER]) {
    await ensureFolder(token, name);
  }

  const state = await readState(token);
  const [cameraItems, backgroundsId, slideshowId, archiveId] = await Promise.all([
    listFolder(token, CAMERA_FOLDER),
    getFolderId(token, BACKGROUNDS_FOLDER),
    getFolderId(token, SLIDESHOW_FOLDER),
    getFolderId(token, ARCHIVE_FOLDER),
  ]);

  // --- Ingest new photos from the camera roll ---
  const newItems = cameraItems.filter((item) => !state.processedIds[item.id]);
  console.log(`${newItems.length} new item(s) in "${CAMERA_FOLDER}" (of ${cameraItems.length} total).`);

  let kept = 0, rejected = 0, safetyRejected = 0;
  for (const item of newItems) {
    state.processedIds[item.id] = true; // mark seen regardless of verdict, so we never re-score it

    if (!passesHeuristics(item)) { rejected++; continue; }

    let verdict;
    try {
      const thumb = await getThumbnailBase64(token, item.id);
      if (!thumb) { rejected++; continue; }
      verdict = await askClaudeVision(item.name, thumb.base64, thumb.mediaType);
    } catch (e) {
      console.warn(`Vision check failed for ${item.name}, skipping: ${e.message}`);
      continue; // leave it processed=false-equivalent? No — already marked processed above to avoid retry storms.
    }

    if (!verdict.keep) {
      rejected++;
      // Deliberately omit the filename here — this can land in CI logs, and a
      // filename plus "flagged as not appropriate" is more than needs to be there.
      if (verdict.reason === 'not appropriate for display') {
        safetyRejected++;
        console.log('REJECT [safety] (filename withheld from log)');
      }
      continue;
    }

    const placement = verdict.placement === 'backgrounds' ? 'backgrounds' : 'slideshow';
    const destId = placement === 'backgrounds' ? backgroundsId : slideshowId;
    console.log(`KEEP  [${placement}] ${item.name} — ${verdict.reason || ''}`);
    await copyItem(token, item.id, item.name, destId);
    kept++;
    // Record under the *source* id too, so aging-out logic (which walks the live
    // Backgrounds/Slideshow folders, not this map) has an addedAt fallback the
    // first time it sees a copy it doesn't recognize.
    state.placedItems[`pending:${item.id}`] = { folder: placement, addedAt: new Date().toISOString(), name: item.name };
  }
  console.log(`Ingest done: ${kept} kept, ${rejected} rejected (${safetyRejected} for safety).`);

  // --- Age out old photos from Backgrounds/Slideshow ---
  await ageOutFolder(token, BACKGROUNDS_FOLDER, archiveId, MAX_BACKGROUNDS, state);
  await ageOutFolder(token, SLIDESHOW_FOLDER, archiveId, MAX_SLIDESHOW, state);

  await writeState(token, state);
  console.log('Done.', summarizeState(state));
}

async function ageOutFolder(token, folderName, archiveId, maxCount, state) {
  const items = await listFolder(token, folderName);
  const withAge = items.map((item) => {
    const known = Object.values(state.placedItems).find((p) => p.name === item.name);
    const addedAt = known?.addedAt || item.createdDateTime;
    return { item, addedAt: new Date(addedAt) };
  });
  withAge.sort((a, b) => a.addedAt - b.addedAt); // oldest first

  const now = Date.now();
  const cutoffMs = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const toArchive = new Set();
  for (const { item, addedAt } of withAge) {
    if (now - addedAt.getTime() > cutoffMs) toArchive.add(item.id);
  }
  const overflow = withAge.length - toArchive.size - maxCount;
  if (overflow > 0) {
    for (const { item } of withAge) {
      if (toArchive.size >= withAge.length - maxCount) break;
      toArchive.add(item.id);
    }
  }

  for (const { item } of withAge) {
    if (!toArchive.has(item.id)) continue;
    console.log(`ARCHIVE [${folderName}] ${item.name}`);
    await moveItem(token, item.id, item.name, archiveId);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
