#!/usr/bin/env node
// One-time local setup script — NOT deployed, NOT run by the app.
//
// Run this once on your own machine to get a Microsoft Graph refresh token
// for reading two OneDrive folders (Kiosk Backgrounds, Kiosk Slideshow) for
// the /kiosk wall display. Unlike Google Photos, there's no "join an album"
// step needed — Graph reads folders by path directly, so this just gets the
// token and prints the env vars to paste into Vercel.
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
//      -> Files.Read and offline_access. (No admin consent needed for a
//      personal Microsoft account.)
//   4. In OneDrive, create two folders at the root: "Kiosk Backgrounds" and
//      "Kiosk Slideshow", and drop a few photos in each.
//
// Usage:
//   MS_CLIENT_ID=... MS_CLIENT_SECRET=... node scripts/get-onedrive-token.mjs

import http from 'node:http';

const CLIENT_ID = process.env.MS_CLIENT_ID;
const CLIENT_SECRET = process.env.MS_CLIENT_SECRET;
const REDIRECT_PORT = 8080;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;
const SCOPES = 'offline_access Files.Read';
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

console.log('Got tokens.\n');
console.log('Add these to Vercel (Project Settings -> Environment Variables):\n');
console.log(`MS_CLIENT_ID=${CLIENT_ID}`);
console.log(`MS_CLIENT_SECRET=${CLIENT_SECRET}`);
console.log(`MS_REFRESH_TOKEN=${tokens.refresh_token}`);
console.log('ONEDRIVE_BACKGROUNDS_FOLDER=Kiosk Backgrounds');
console.log('ONEDRIVE_SLIDESHOW_FOLDER=Kiosk Slideshow');
console.log('\n(Adjust the two folder names above if you named them differently.)');
console.log('Then redeploy for them to take effect.');
