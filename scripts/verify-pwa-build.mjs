import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const dist = join(process.cwd(), 'dist');
const manifest = JSON.parse(await readFile(join(dist, 'manifest.webmanifest'), 'utf8'));
const serviceWorker = await readFile(join(dist, 'sw.js'), 'utf8');
const files = await readdir(dist);
const jsBundles = await Promise.all(
  files.filter((file) => file.endsWith('.js')).map((file) => readFile(join(dist, file), 'utf8'))
);
const generatedRuntime = [serviceWorker, ...jsBundles].join('\n');

assert.equal(manifest.dir, 'rtl', 'PWA manifest must preserve RTL direction');
assert.equal(manifest.lang, 'ar', 'PWA manifest must preserve Arabic language');
assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 3, 'PWA icons must be present');
assert.ok(serviceWorker.length > 0, 'Workbox service worker must be generated');
assert.ok(generatedRuntime.includes('precacheAndRoute'), 'Workbox precache route must be present');
assert.ok(serviceWorker.includes('google-fonts-cache'), 'Google Fonts runtime cache must be configured');
assert.ok(serviceWorker.includes('gstatic-fonts-cache'), 'gstatic runtime cache must be configured');
assert.ok(generatedRuntime.includes('index.html'), 'Application shell must be included in the generated cache manifest');

console.log('PWA build artifact validation passed: Arabic RTL manifest, app-shell precache, and font runtime caches.');
