import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const toolsDirectory = process.env.HISABATI_TEST_TOOLS_DIR || resolve(process.cwd(), '.test-tools/node_modules');
const playwrightEntry = pathToFileURL(resolve(toolsDirectory, 'playwright/index.mjs')).href;
const { chromium } = await import(playwrightEntry);
const previewPort = Number(process.env.PWA_PREVIEW_PORT || 4173);
const baseUrl = `http://127.0.0.1:${previewPort}`;
const viteEntry = resolve(process.cwd(), 'node_modules/vite/bin/vite.js');
const preview = spawn(process.execPath, [viteEntry, 'preview', '--host', '127.0.0.1', '--port', String(previewPort), '--strictPort'], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});

let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (preview.exitCode !== null) {
      throw new Error(`Vite preview exited early with code ${preview.exitCode}`);
    }
    try {
      const response = await fetch(baseUrl);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // Preview server is still starting.
    }
    await delay(250);
  }
  assert.equal(ready, true, 'Vite preview did not become ready.');

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const response = await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  assert.ok(response?.ok(), 'The PWA shell must load online.');

  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service workers are unavailable in the test browser.');
    }
    await navigator.serviceWorker.ready;
  });

  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
    await page.reload({ waitUntil: 'domcontentloaded' });
  }
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), undefined, { timeout: 30_000 });

  const cacheState = await page.evaluate(async () => {
    const names = await caches.keys();
    const precacheNames = names.filter((name) => name.includes('workbox-precache'));
    const requests = [];
    for (const name of precacheNames) {
      const cache = await caches.open(name);
      const keys = await cache.keys();
      requests.push(...keys.map((request) => new URL(request.url).pathname));
    }
    return {
      controller: Boolean(navigator.serviceWorker.controller),
      precacheNames,
      requests,
      rootExists: Boolean(document.getElementById('root')),
      title: document.title,
    };
  });

  assert.equal(cacheState.controller, true, 'The active service worker must control the page.');
  assert.ok(cacheState.precacheNames.length > 0, 'Workbox precache cache must be created.');
  assert.ok(
    cacheState.requests.some((path) => path === '/' || path === '/index.html'),
    'The application HTML shell must be precached.',
  );
  assert.ok(cacheState.requests.some((path) => path.startsWith('/assets/') && path.endsWith('.js')),
    'At least one application JavaScript bundle must be precached.');
  assert.equal(cacheState.rootExists, true, 'The application mount point must exist.');
  assert.match(cacheState.title, /Hisabati|حساباتي/i);

  await context.setOffline(true);
  const offlineResponse = await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  assert.ok(offlineResponse?.ok(), 'The service worker must serve the application shell while offline.');

  const offlineState = await page.evaluate(() => ({
    controller: Boolean(navigator.serviceWorker.controller),
    rootExists: Boolean(document.getElementById('root')),
    title: document.title,
  }));
  assert.equal(offlineState.controller, true, 'The service worker must remain active offline.');
  assert.equal(offlineState.rootExists, true, 'The application shell must remain available offline.');
  assert.match(offlineState.title, /Hisabati|حساباتي/i);
  assert.deepEqual(pageErrors, [], 'The PWA must not produce uncaught page errors during online/offline startup.');

  console.log('PASS PWA service worker registration and control');
  console.log(`PASS Workbox precache contains ${cacheState.requests.length} cached request(s)`);
  console.log('PASS application shell reloads while browser networking is offline');
} finally {
  if (browser) {
    await browser.close();
  }
  preview.kill('SIGTERM');
}
