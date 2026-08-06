#!/usr/bin/env node
// One-time local setup script — NOT deployed, NOT run by the app.
//
// Run this once on your own machine to:
//   1. Get a Google OAuth refresh token for your Google Photos library.
//   2. "Join" the two shared kiosk albums so the app can list their photos
//      going forward (Google restricted broad library access in 2025, but
//      an app that has joined a shared album can keep reading it).
//   3. Print the env vars to paste into Vercel.
//
// Usage:
//   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node scripts/get-google-photos-token.mjs
//
// You'll be prompted for the two Google Photos share links (Kiosk
// Backgrounds, Kiosk Slideshow) after logging in.

import http from 'node:http';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_PORT = 8080;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;
const SCOPES = [
  'https://www.googleapis.com/auth/photoslibrary.readonly',
  'https://www.googleapis.com/auth/photoslibrary.sharing',
].join(' ');

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (from the OAuth client you created) and re-run.');
  process.exit(1);
}

function waitForAuthCode() {
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent'); // force a refresh_token even on repeat runs

  console.log('\nOpen this URL, log in, and approve access:\n');
  console.log(authUrl.toString());
  console.log('\nWaiting for the redirect back to localhost...\n');

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, REDIRECT_URI);
      if (url.pathname !== '/callback') { res.writeHead(404); res.end(); return; }
      const code = url.searchParams.get('code');
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(code ? 'Success — you can close this tab and return to the terminal.' : 'No code received.');
      server.close();
      code ? resolve(code) : reject(new Error('No authorization code in callback'));
    });
    server.listen(REDIRECT_PORT);
  });
}

async function exchangeCodeForTokens(code) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Token exchange failed: ${JSON.stringify(data)}`);
  return data; // { access_token, refresh_token, expires_in, ... }
}

async function joinSharedAlbum(accessToken, shareUrl) {
  // The share token is the path segment after "/share/", before any "?".
  const match = shareUrl.match(/\/share\/([^/?]+)/);
  if (!match) throw new Error(`Couldn't find a share token in: ${shareUrl}`);
  const shareToken = match[1];

  const res = await fetch('https://photoslibrary.googleapis.com/v1/albums:join', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ shareToken }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Join failed for ${shareUrl}: ${JSON.stringify(data)}`);
  return data.album.id;
}

const code = await waitForAuthCode();
const tokens = await exchangeCodeForTokens(code);
console.log('Got tokens.\n');

const rl = createInterface({ input: stdin, output: stdout });
const backgroundsUrl = await rl.question('Paste the "Kiosk Backgrounds" share link: ');
const slideshowUrl = await rl.question('Paste the "Kiosk Slideshow" share link: ');
rl.close();

const backgroundsAlbumId = await joinSharedAlbum(tokens.access_token, backgroundsUrl.trim());
const slideshowAlbumId = await joinSharedAlbum(tokens.access_token, slideshowUrl.trim());

console.log('\nAdd these to Vercel (Project Settings → Environment Variables):\n');
console.log(`GOOGLE_CLIENT_ID=${CLIENT_ID}`);
console.log(`GOOGLE_CLIENT_SECRET=${CLIENT_SECRET}`);
console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
console.log(`GOOGLE_PHOTOS_BACKGROUNDS_ALBUM_ID=${backgroundsAlbumId}`);
console.log(`GOOGLE_PHOTOS_SLIDESHOW_ALBUM_ID=${slideshowAlbumId}`);
console.log('\nThen redeploy for them to take effect.');
