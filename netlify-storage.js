/**
 * JINBASE persistent storage adapter.
 *
 * Production (Netlify Functions): Netlify Blobs, site-wide + strongly consistent.
 * Local npm start: JSON files under data/ for offline development.
 */
const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');

const IS_NETLIFY = process.env.NETLIFY === 'true' || !!process.env.NETLIFY_SITE_ID;
const STORE_NAME = 'jinbase-data';
const blobKeys = {
  contributors: 'contributors.json',
  adminConfig: 'admin-config.json',
};

let blobStorePromise = null;

async function getBlobStore() {
  if (!IS_NETLIFY) return null;
  if (!blobStorePromise) {
    blobStorePromise = import('@netlify/blobs').then(({ getStore }) =>
      getStore({ name: STORE_NAME, consistency: 'strong' })
    );
  }
  return blobStorePromise;
}

async function readJson(key, fallbackPath) {
  const store = await getBlobStore();

  if (store) {
    const data = await store.get(blobKeys[key] || key, {
      type: 'json',
      consistency: 'strong',
    });

    if (data !== null) return data;

    // First production deployment: migrate the repository seed file into Blobs.
    const raw = await fs.readFile(fallbackPath, 'utf8');
    const parsed = JSON.parse(raw);
    await store.setJSON(blobKeys[key] || key, parsed);
    console.log(`☁️ [Netlify Blobs] Initialized ${key} from repository seed.`);
    return parsed;
  }

  const raw = await fs.readFile(fallbackPath, 'utf8');
  return JSON.parse(raw);
}

async function writeJson(key, value, fallbackPath) {
  const store = await getBlobStore();

  if (store) {
    await store.setJSON(blobKeys[key] || key, value);
    return;
  }

  await fs.writeFile(fallbackPath, JSON.stringify(value, null, 4), 'utf8');
}

function seedExists(filePath) {
  return fsSync.existsSync(filePath);
}

module.exports = { IS_NETLIFY, readJson, writeJson, seedExists };
