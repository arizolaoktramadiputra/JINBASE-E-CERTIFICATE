/**
 * JINBASE persistent storage adapter.
 *
 * Production (Netlify Functions): Netlify Blobs.
 * Local npm start: JSON files under data/ for offline development.
 */

const fs = require('fs/promises');
const fsSync = require('fs');

const IS_NETLIFY =
  process.env.NETLIFY === 'true' ||
  !!process.env.NETLIFY_SITE_ID ||
  !!process.env.SITE_ID;

const STORE_NAME = 'jinbase-data';

const blobKeys = {
  contributors: 'contributors.json',
  adminConfig: 'admin-config.json',
};

const { getStore } = require('@netlify/blobs');

// Manual override for when Netlify's automatic Blobs context detection
// fails (a known issue, especially behind serverless-http/Lambda-compat
// wrappers). Set these in Site configuration → Environment variables:
//   BLOBS_SITE_ID  = Site settings → General → Site details → Site ID
//   BLOBS_TOKEN    = User settings → Applications → Personal access tokens
const MANUAL_SITE_ID = process.env.BLOBS_SITE_ID || process.env.NETLIFY_SITE_ID;
const MANUAL_TOKEN = process.env.BLOBS_TOKEN;

async function getBlobStore() {
  if (!IS_NETLIFY) return null;

  const opts = { name: STORE_NAME };

  // Only pass these explicitly if provided — if automatic context ever
  // starts working again, this stays a no-op.
  if (MANUAL_SITE_ID && MANUAL_TOKEN) {
    opts.siteID = MANUAL_SITE_ID;
    opts.token = MANUAL_TOKEN;
  }

  // Intentionally NOT cached across invocations: getStore() must be
  // called fresh after connectLambda(event) has set up the per-request
  // context, otherwise a warm container can reuse a store resolved
  // before that context existed.
  try {
    return getStore(opts);
  } catch (err) {
    console.error('❌ getStore() failed:', err.message);
    return null;
  }
}

// esbuild's Netlify bundling can relocate __dirname relative to the
// repo root, so a single hardcoded fallbackPath can go stale in
// production. Try the given path plus a couple of likely alternates.
async function readFileWithFallback(fallbackPath) {
  const path = require('path');
  const candidates = [
    fallbackPath,
    path.join(process.cwd(), 'data', path.basename(fallbackPath)),
    path.join(__dirname, 'data', path.basename(fallbackPath)),
    path.join('/var/task', 'data', path.basename(fallbackPath)),
  ];

  let lastErr;
  for (const candidate of candidates) {
    try {
      return await fs.readFile(candidate, 'utf8');
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

async function readJson(key, fallbackPath) {
  const store = await getBlobStore();

  if (store) {
    try {
      const data = await store.get(blobKeys[key] || key, {
        type: 'json',
      });

      if (data !== null) {
        return data;
      }

      // First production deployment:
      // migrate the repository seed file into Netlify Blobs.
      const raw = await readFileWithFallback(fallbackPath);
      const parsed = JSON.parse(raw);

      await store.setJSON(blobKeys[key] || key, parsed);

      console.log(
        `☁️ [Netlify Blobs] Initialized ${key} from repository seed.`
      );

      return parsed;
    } catch (err) {
      console.error(
        `❌ Netlify Blobs error for "${key}", falling back to seed file:`,
        err.message
      );
      const raw = await readFileWithFallback(fallbackPath);
      return JSON.parse(raw);
    }
  }

  const raw = await readFileWithFallback(fallbackPath);
  return JSON.parse(raw);
}

async function writeJson(key, value, fallbackPath) {
  const store = await getBlobStore();

  if (store) {
    await store.setJSON(blobKeys[key] || key, value);
    return;
  }

  await fs.writeFile(
    fallbackPath,
    JSON.stringify(value, null, 4),
    'utf8'
  );
}

function seedExists(filePath) {
  return fsSync.existsSync(filePath);
}

module.exports = {
  IS_NETLIFY,
  readJson,
  writeJson,
  seedExists,
};