#!/usr/bin/env node
// One-time local setup script — NOT deployed, NOT run by the app.
//
// Run this to get a Microsoft Graph refresh token for ONE of the two
// consumers — api/kiosk-photos.js (Vercel, reads Kiosk Backgrounds/Slideshow
// for the /kiosk display) OR scripts/rotate-kiosk-photos.mjs (GitHub Actions,
// curates photos into/out of those folders).
//
// RUN THIS TWICE, once per consumer, and DO NOT reuse the same resulting
// refresh_token in both places. Microsoft rotates a refresh token on every
// use — if Vercel and GitHub Actions share one, whichever used it more
// recently invalidates the other's copy, and the other starts failing with
// invalid_grant. Two separate authorization runs produce two independent
// tokens with independent rotation chains that don't step on each other.
// (This bit us for real: the rotate-kiosk-photos GitHub Action ran, rotated
// the token both sides were sharing, and the kiosk's photo API broke.)
//
// Unlike Google Photos, there's no "join an album" step needed — Graph reads
// folders by path directly, so this just gets the token and prints the env
// var(s) to paste into whichever one you're minting for this run.
//
// Prereqs (Azure Portal, https://portal.azure.com):
//   1. Azure Active Directory -> App registrations -> New registration.
//      - Supported account types: "Personal Microsoft accounts only" (or
//        "Accounts in any organizational directory and personal Microsoft
//        accounts", either works for a personal OneDrive).
//      - Redirect URI: platform "Web", value http://localhost:8080/callback
//   2. Certificates & secrets -> New client secret. Copy its VALUE (not the
//      secret ID) — that's MS_CLIENT_SECRET below.
//   3. API permissions -> Add a permission -> Microsoft Graph -> Delegated
//      -> Files.ReadWrite and offline_access. (No admin consent needed for a
//      personal Microsoft account.)
//   4. Turn on Camera Backup in the OneDrive mobile app (profile picture ->
//      Camera Backup -> on) if you haven't already, then check OneDrive on
//      the web to see what folder it actually lands in — usually
//      "Pictures/Camera Roll" at the root, but that destination is fixed by
//      the app and can't be renamed/redirected, so confirm the real name.
//      That's what you'll set ONEDRIVE_CAMERA_FOLDER to.
//   5. Separately, create three plain folders at the OneDrive root that have
//      nothing to do with any backup app: "Kiosk Backgrounds", "Kiosk
//      Slideshow", "Kiosk Archive" (rotate-kiosk-photos.mjs will also create
//      any of these three that are missing on its first run — just not the
//      camera folder, since that one has to match your real backup location).
//
// If you ever see invalid_grant auth failures on either side (token expired
// from months of disuse, or accidentally shared again), just re-run this
// script for that one consumer to mint it a fresh, independent token.
//
// Usage:
//   MS_CLIENT_ID=... MS_CLIENT_SECRET=... node scripts/get-onedrive-token.mjs vercel
//   MS_CLIENT_ID=... MS_CLIENT_SECRET=... node scripts/get-onedrive-token.mjs github

import http from 'node:http';

const CLIENT_ID = process.env.MS_CLIENT_ID;
const CLIENT_SECRET = process.env.MS_CLIENT_SECRET;
const REDIRECT_PORT = 8080;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;
const SCOPES = 'offline_access Files.ReadWrite';
// A "Personal Microsoft accounts only" app registration must use the
// /consumers/ endpoint specifically — /common/ (which also accepts
// work/school accounts) throws "unauthorized_client...not enabled for
// consumers" against a personal-only registration.
const AUTHORITY = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set MS_CLIENT_ID and MS_CLIENT_SECRET (from the Azure app registration) and re-run.');
  process.exit(1);
}

function waitForAuthCode() {
  const authUrl = new URL(`${AUTHORITY}/authorize`);
  authUrl.searchParams.set('client_id', CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('response_mode', 'query');
  authUrl.searchParams.set('scope', SCOPES);

  console.log('\nOpen this URL, log in, and approve access:\n');
  console.log(authUrl.toString());
  console.log('\nWaiting for the redirect back to localhost...\n');

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, REDIRECT_URI);
      if (url.pathname !== '/callback') { res.writeHead(404); res.end(); return; }
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error_description');
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(code ? 'Success — you can close this tab and return to the terminal.' : `Error: ${error}`);
      server.close();
      code ? resolve(code) : reject(new Error(error || 'No authorization code in callback'));
    });
    server.listen(REDIRECT_PORT);
  });
}

async function exchangeCodeForTokens(code) {
  const res = await fetch(`${AUTHORITY}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
      scope: SCOPES,
    }),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`Non-JSON response from token endpoint: ${text.slice(0, 300)}`); }
  if (!res.ok) throw new Error(`Token exchange failed: ${JSON.stringify(data)}`);
  return data; // { access_token, refresh_token, expires_in, ... }
}

const code = await waitForAuthCode();
const tokens = await exchangeCodeForTokens(code);

const target = process.argv[2]; // 'vercel' | 'github' | undefined

console.log('Got tokens.\n');

if (target !== 'github') {
  console.log('--- For Vercel (Project Settings -> Environment Variables) ---');
  console.log('Used by api/kiosk-photos.js. Do NOT also put this MS_REFRESH_TOKEN in GitHub Actions.\n');
  console.log(`MS_CLIENT_ID=${CLIENT_ID}`);
  console.log(`MS_CLIENT_SECRET=${CLIENT_SECRET}`);
  console.log(`MS_REFRESH_TOKEN=${tokens.refresh_token}`);
  console.log('ONEDRIVE_BACKGROUNDS_FOLDER=Kiosk Backgrounds');
  console.log('ONEDRIVE_SLIDESHOW_FOLDER=Kiosk Slideshow');
  console.log('\nRedeploy the Vercel app for its env vars to take effect.');
}
if (target !== 'vercel') {
  if (target !== 'github') console.log('\n');
  console.log('--- For GitHub Actions (repo Settings -> Secrets and variables -> Actions) ---');
  console.log('Used by scripts/rotate-kiosk-photos.mjs. Do NOT also put this MS_REFRESH_TOKEN in Vercel.\n');
  console.log(`MS_CLIENT_ID=${CLIENT_ID}`);
  console.log(`MS_CLIENT_SECRET=${CLIENT_SECRET}`);
  console.log(`MS_REFRESH_TOKEN=${tokens.refresh_token}`);
  console.log('(plus ANTHROPIC_API_KEY and ONEDRIVE_CAMERA_FOLDER, which this script doesn\'t generate)');
}
if (!target) {
  console.log('\n*** You just got ONE token — the printouts above both show it, but pick only\n' +
              '*** ONE destination for it. Re-run this script (`node scripts/get-onedrive-token.mjs github`\n' +
              '*** or `... vercel`) to mint the second, independent token for the other one. ***');
}
