/**
 * JINBASE E-Certificate — Backend API
 * ============================================================
 * Features:
 *  - POST /api/search          — fuzzy email search (existing)
 *  - GET  /api/stats           — live contributor + fund stats (NEW)
 *  - GET  /verify/:code        — JSON verification by cert code (NEW)
 *  - GET  /v/:code             — public HTML verification page (NEW)
 *  - GET  /v/:code/og-image.png — dynamic OG image per contributor (NEW)
 * ============================================================
 */

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readJson, writeJson, IS_NETLIFY } = require('./netlify-storage');

// Server last updated: 2026-09-01 (reloaded with 501 contributors)
const app = express();
const PORT = process.env.PORT || 3000;
// Netlify Functions berjalan di belakang proxy.
// Diperlukan agar express-rate-limit dapat membaca request.ip
// dari X-Forwarded-For dengan benar.
app.set('trust proxy', 1);

/* ------------------------------------------------------------
   LOAD DATA (sekali saat startup, hanya ada di memori server)
------------------------------------------------------------ */
const DATA_PATH_JSON = path.join(__dirname, 'data', 'contributors.json');
const DATA_PATH_JS = path.join(__dirname, 'data', 'contributors.js');
const ADMIN_CONFIG_PATH = path.join(__dirname, 'data', 'admin-config.json');

let contributors = [];
let codeMap = new Map(); // verifyCode -> contributor
let statsCache = null;

function generateVerifyCode(contributor) {
  // Deterministik hash dari id + email — selalu sama untuk kontributor yang sama
  const raw = `${contributor.id || ''}:${(contributor.email || '').toLowerCase()}`;
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const part1 = hash.slice(0, 4).toUpperCase();
  const part2 = hash.slice(4, 8).toUpperCase();
  return `JB-${part1}-${part2}`;
}

function buildStatsCache() {
  let totalFunds = 0;
  let totalMerchandise = 0;
  let totalMoney = 0;

  for (const c of contributors) {
    if (c.contribution_type === 'merchandise') {
      totalMerchandise++;
    } else {
      totalMoney++;
      const amt = parseInt(c.amount || '0', 10);
      if (!isNaN(amt)) totalFunds += amt;
    }
  }

  statsCache = {
    totalContributors: contributors.length,
    totalFunds,
    totalMoney,
    totalMerchandise,
  };
}

function rebuildCodeMap() {
  codeMap.clear();
  for (const c of contributors) {
    const code = generateVerifyCode(c);
    if (!codeMap.has(code)) {
      codeMap.set(code, { ...c, verifyCode: code });
    }
  }
  buildStatsCache();
}

async function loadContributors() {
  try {
    const parsed = await readJson('contributors', DATA_PATH_JSON);
    contributors = Array.isArray(parsed?.contributors) ? parsed.contributors : [];
    rebuildCodeMap();
    console.log(`✅ Loaded ${contributors.length} contributors ${IS_NETLIFY ? '(Netlify Blobs)' : '(local JSON)'}.`);
    console.log(`✅ Built ${codeMap.size} verification codes.`);
  } catch (err) {
    console.error('❌ Failed to load contributors:', err.message);
    contributors = [];
    rebuildCodeMap();
    throw err;
  }
}

let contributorsLoadPromise = null;
function ensureContributorsLoaded() {
  if (!contributorsLoadPromise) {
    contributorsLoadPromise = loadContributors().catch(err => {
      contributorsLoadPromise = null;
      throw err;
    });
  }
  return contributorsLoadPromise;
}

async function saveContributors() {
  const data = {
    contributors,
    meta: {
      total: contributors.length,
      updated_at: new Date().toISOString(),
      source: 'JINBASE Owner Dashboard & Database Sync'
    }
  };

  await writeJson('contributors', data, DATA_PATH_JSON);

  if (!IS_NETLIFY) {
    const jsContent = `window.CONTRIBUTORS_DATA = ${JSON.stringify(data, null, 4)};\n`;
    fs.writeFileSync(DATA_PATH_JS, jsContent, 'utf8');
  }

  rebuildCodeMap();
}

ensureContributorsLoaded().catch(() => { });

/* ------------------------------------------------------------
   ADMIN AUTHENTICATION & CONFIGURATION (SINGLE OWNER ACCOUNT)
------------------------------------------------------------ */
const IMMUTABLE_USERNAME = 'jinbase.owner';
let adminConfig = null;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 jam

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

function generateRandomKey() {
  const hex = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `JB-RECOVERY-${hex}`;
}

async function loadAdminConfig() {
  try {
    if (!IS_NETLIFY && fs.existsSync(ADMIN_CONFIG_PATH)) {
      const raw = fs.readFileSync(ADMIN_CONFIG_PATH, 'utf8');
      adminConfig = JSON.parse(raw);
      adminConfig.username = IMMUTABLE_USERNAME;
      return;
    }

    if (IS_NETLIFY) {
      const parsed = await readJson('adminConfig', ADMIN_CONFIG_PATH);
      adminConfig = parsed || null;
      if (adminConfig) adminConfig.username = IMMUTABLE_USERNAME;
      return;
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const defaultPassword = process.env.JINBASE_ADMIN_DEFAULT_PASSWORD || 'JinbaseAdmin2026!';
    const passwordHash = hashPassword(defaultPassword, salt);
    const recoveryKey = generateRandomKey();
    adminConfig = {
      username: IMMUTABLE_USERNAME, salt, passwordHash, recoveryKey,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(ADMIN_CONFIG_PATH, JSON.stringify(adminConfig, null, 2), 'utf8');
    console.log('🔑 [SECURITY] Admin config initialized locally.');
  } catch (err) {
    console.error('❌ Failed to load/create admin config:', err.message);
    throw err;
  }
}

let adminConfigLoadPromise = null;
function ensureAdminConfigLoaded() {
  if (!adminConfigLoadPromise) {
    adminConfigLoadPromise = loadAdminConfig().catch(err => {
      adminConfigLoadPromise = null;
      throw err;
    });
  }
  return adminConfigLoadPromise;
}

async function saveAdminConfig() {
  adminConfig.username = IMMUTABLE_USERNAME;
  await writeJson('adminConfig', adminConfig, ADMIN_CONFIG_PATH);
}

ensureAdminConfigLoaded().catch(() => { });

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function getSessionSecret() {
  return process.env.ADMIN_SESSION_SECRET || `${IMMUTABLE_USERNAME}:${adminConfig?.passwordHash || 'not-ready'}`;
}

function createSessionToken() {
  const payload = {
    username: IMMUTABLE_USERNAME,
    exp: Date.now() + SESSION_TTL_MS,
    pv: (adminConfig.passwordHash || '').slice(0, 24),
    nonce: crypto.randomBytes(8).toString('hex'),
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', getSessionSecret()).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function verifySessionToken(token) {
  try {
    const [encoded, signature] = String(token || '').split('.');
    if (!encoded || !signature) return null;
    const expected = crypto.createHmac('sha256', getSessionSecret()).update(encoded).digest('base64url');
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(base64UrlDecode(encoded));
    if (payload.username !== IMMUTABLE_USERNAME) return null;
    if (payload.exp <= Date.now()) return null;
    if (payload.pv !== (adminConfig.passwordHash || '').slice(0, 24)) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

async function requireAdminAuth(req, res, next) {
  try {
    await ensureAdminConfigLoaded();
    const authHeader = req.headers['authorization'] || '';
    let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    if (!token) token = req.headers['x-admin-token'] || req.query.token;
    const session = verifySessionToken(token);
    if (!session) return res.status(401).json({ error: 'Akses ditolak atau sesi telah berakhir. Silakan login kembali.' });
    req.adminUser = session;
    next();
  } catch (err) {
    console.error('❌ Admin auth error:', err);
    return res.status(500).json({ error: 'Konfigurasi autentikasi server tidak dapat dimuat.' });
  }
}

/* ------------------------------------------------------------
   MIDDLEWARE
------------------------------------------------------------ */
app.use(express.json());
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));

// Rate limit: cegah brute-force
const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak percobaan. Coba lagi sebentar lagi.' },
});

const verifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak request. Coba lagi sebentar lagi.' },
});

const adminAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak percobaan login/recovery. Coba lagi dalam 15 menit.' },
});

app.use(async (req, res, next) => {
  const needsContributors =
    req.path === '/api/stats' ||
    req.path === '/api/search' ||
    req.path.startsWith('/verify/') ||
    req.path.startsWith('/v/') ||
    req.path === '/api/admin/contributors' ||
    req.path.startsWith('/api/admin/contributors/');

  if (!needsContributors) return next();
  try {
    await ensureContributorsLoaded();
    await loadContributors();
    next();
  } catch (err) {
    console.error('❌ Persistent contributor storage error:', err);
    return res.status(500).json({ error: 'Storage contributor tidak dapat diakses.' });
  }
});

// Lindungi folder data dan file internal
app.use('/data', (req, res) => res.status(403).send('Forbidden'));
app.get(['/server.js', '/package.json', '/package-lock.json'], (req, res) => res.status(403).send('Forbidden'));

// Sajikan rute khusus admin
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});
app.get('/owner', (req, res) => {
  res.redirect('/admin');
});

// Sajikan file statis frontend
app.use(express.static(__dirname));

/* ------------------------------------------------------------
   HELPERS
------------------------------------------------------------ */
function normalize(str) {
  return (str || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function stripKey(str) {
  return normalize(str).replace(/[^a-z0-9]/g, '');
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function maskEmail(email) {
  if (!email) return '';
  const [local, domain] = email.split('@');
  if (!domain) return email;
  return `${local[0]}***@${domain}`;
}

function getProjectLabel(contributor) {
  if (contributor.project_name) return contributor.project_name;
  return contributor.contribution_type === 'merchandise'
    ? 'BTS JIN PROJECT — Merchandise'
    : 'BTS JIN PROJECT — Dana';
}

function searchContributors(query) {
  const q = normalize(query);
  const qKey = stripKey(query);
  if (!q || q.length < 2) return [];

  const exact = [];
  const substring = [];
  const fuzzy = [];

  for (const c of contributors) {
    const emailNorm = normalize(c.email || '');
    const emailKey = stripKey(c.email || '');
    const nameNorm = normalize(c.name || '');
    const nameKey = stripKey(c.name || '');
    const searchKey = normalize(c.search_key || '');
    const emailSearchKey = normalize(c.email_search_key || '');

    // Exact match
    if (
      emailNorm === q || emailKey === qKey ||
      nameNorm === q || nameKey === qKey ||
      searchKey === qKey || emailSearchKey === qKey
    ) {
      exact.push({ contributor: c, score: 0 });
      continue;
    }

    // Substring match
    if (
      emailNorm.includes(q) || emailKey.includes(qKey) ||
      nameNorm.includes(q) || nameKey.includes(qKey) ||
      searchKey.includes(qKey) || emailSearchKey.includes(qKey) ||
      q.includes(emailNorm) || (emailKey.length >= 4 && qKey.includes(emailKey))
    ) {
      substring.push({ contributor: c, score: 1 });
      continue;
    }

    // Fuzzy match on email or name key
    if (qKey.length >= 4) {
      let minDist = 999;
      if (emailKey.length >= 4) {
        const dist = levenshtein(qKey, emailKey);
        const maxDist = emailKey.length <= 10 ? 2 : 3;
        if (dist <= maxDist && dist < minDist) minDist = dist;
      }
      if (nameKey.length >= 4) {
        const dist = levenshtein(qKey, nameKey);
        const maxDist = nameKey.length <= 10 ? 2 : 3;
        if (dist <= maxDist && dist < minDist) minDist = dist;
      }
      if (minDist < 999) {
        fuzzy.push({ contributor: c, score: 2 + minDist });
      }
    }
  }

  // Deduplikasi contributor
  const seen = new Set();
  const sorted = [...exact, ...substring, ...fuzzy].sort((a, b) => a.score - b.score);
  const results = [];
  for (const r of sorted) {
    const key = `${r.contributor.id}-${r.contributor.email}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push(r.contributor);
    }
  }

  return results;
}

/* ------------------------------------------------------------
   OG IMAGE GENERATOR
------------------------------------------------------------ */
async function generateOgImage(contributor) {
  try {
    const { createCanvas } = require('@napi-rs/canvas');

    const W = 1200, H = 630;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // Background gradient (deep crimson to dark)
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#1a0005');
    bg.addColorStop(0.5, '#3d0010');
    bg.addColorStop(1, '#0a0000');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Decorative circles (background flair)
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = '#C41E3A';
    ctx.lineWidth = 80;
    ctx.beginPath();
    ctx.arc(W * 0.15, H * 0.5, 300, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(W * 0.85, H * 0.5, 200, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Gold accent bar left
    const goldGrad = ctx.createLinearGradient(0, 0, 0, H);
    goldGrad.addColorStop(0, '#C9A84C');
    goldGrad.addColorStop(1, '#E2C97E');
    ctx.fillStyle = goldGrad;
    ctx.fillRect(0, 0, 8, H);

    // "VERIFIED" badge top-right
    ctx.save();
    ctx.fillStyle = 'rgba(201,168,76,0.15)';
    ctx.strokeStyle = '#C9A84C';
    ctx.lineWidth = 1.5;
    const badgeX = W - 200, badgeY = 40, badgeW = 160, badgeH = 36;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 18);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#C9A84C';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('✓  VERIFIED', badgeX + badgeW / 2, badgeY + 23);
    ctx.restore();

    // Brand — top left
    ctx.fillStyle = '#C41E3A';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('JINBASE INDONESIA', 60, 68);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '14px sans-serif';
    ctx.fillText('BTS JIN PROJECT E-Certificate', 60, 92);

    // Divider line
    ctx.strokeStyle = 'rgba(201,168,76,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(60, 115);
    ctx.lineTo(W - 60, 115);
    ctx.stroke();

    // "WITH APPRECIATION" label
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'left';
    ctx.letterSpacing = '4px';
    ctx.fillText('WITH  APPRECIATION  FOR', 60, 185);

    // Contributor name — large
    const name = contributor.name || 'Kontributor';
    ctx.fillStyle = '#FFFFFF';
    // Responsive font size
    let fontSize = 88;
    ctx.font = `bold ${fontSize}px sans-serif`;
    while (ctx.measureText(name).width > W - 140 && fontSize > 40) {
      fontSize -= 4;
      ctx.font = `bold ${fontSize}px sans-serif`;
    }
    ctx.fillText(name, 60, 290);

    // Name underline
    const nameWidth = Math.min(ctx.measureText(name).width, W - 140);
    const underlineGrad = ctx.createLinearGradient(60, 0, 60 + nameWidth, 0);
    underlineGrad.addColorStop(0, '#C9A84C');
    underlineGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = underlineGrad;
    ctx.fillRect(60, 305, nameWidth, 3);

    // Project label
    const projectLabel = getProjectLabel(contributor);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '22px sans-serif';
    ctx.fillText(projectLabel, 60, 360);

    // Body text
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '16px sans-serif';
    ctx.fillText('In grateful recognition of your generosity and unwavering support.', 60, 415);

    // Verify code — bottom
    const verifyCode = contributor.verifyCode || generateVerifyCode(contributor);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '13px monospace';
    ctx.fillText(`Kode Verifikasi: ${verifyCode}`, 60, H - 50);

    // URL bottom right
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('www.btsjinproject.com', W - 60, H - 50);

    return canvas.toBuffer('image/png');
  } catch (err) {
    console.error('OG image generation failed:', err);
    return null;
  }
}

/* ------------------------------------------------------------
   HTML TEMPLATE — Verification Page (/v/:code)
------------------------------------------------------------ */
function buildVerifyHtml(contributor, code, baseUrl) {
  const name = escapeHtmlServer(contributor.name || '');
  const projectLabel = escapeHtmlServer(getProjectLabel(contributor));
  const ogImageUrl = `${baseUrl}/v/${code}/og-image.png`;
  const pageUrl = `${baseUrl}/v/${code}`;
  const certType = contributor.contribution_type === 'merchandise' ? 'Merchandise' : 'Dana';

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${name} — JINBASE E-Certificate Verification</title>
  <meta name="description" content="${name} adalah kontributor terverifikasi BTS JIN PROJECT oleh JINBASE Indonesia." />

  <!-- Open Graph -->
  <meta property="og:title" content="${name} — JINBASE E-Certificate" />
  <meta property="og:description" content="Kontributor terverifikasi BTS JIN PROJECT (${certType}). Kode: ${code}" />
  <meta property="og:image" content="${ogImageUrl}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:url" content="${pageUrl}" />
  <meta property="og:type" content="website" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${name} — JINBASE E-Certificate" />
  <meta name="twitter:description" content="Kontributor terverifikasi BTS JIN PROJECT. Kode: ${code}" />
  <meta name="twitter:image" content="${ogImageUrl}" />

  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', sans-serif;
      background: #0a0000;
      color: #fff;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    .verify-bg {
      position: fixed; inset: 0;
      background: radial-gradient(ellipse at 20% 50%, rgba(139,0,0,0.3) 0%, transparent 60%),
                  radial-gradient(ellipse at 80% 20%, rgba(196,30,58,0.15) 0%, transparent 50%),
                  #0a0000;
      z-index: 0;
    }
    .verify-card {
      position: relative; z-index: 1;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.10);
      border-radius: 24px;
      padding: 3rem;
      max-width: 560px;
      width: 100%;
      text-align: center;
      backdrop-filter: blur(20px);
      box-shadow: 0 32px 80px rgba(0,0,0,0.5);
    }
    .verify-badge {
      display: inline-flex; align-items: center; gap: 8px;
      background: rgba(201,168,76,0.12);
      border: 1px solid rgba(201,168,76,0.35);
      color: #C9A84C;
      font-size: 0.75rem; font-weight: 700;
      letter-spacing: 0.1em;
      padding: 6px 16px;
      border-radius: 100px;
      margin-bottom: 2rem;
      text-transform: uppercase;
    }
    .verify-badge::before { content: '✓'; font-size: 0.9em; }
    .verify-org {
      font-size: 0.7rem; font-weight: 600; letter-spacing: 0.15em;
      color: rgba(255,255,255,0.35);
      text-transform: uppercase;
      margin-bottom: 0.5rem;
    }
    .verify-title {
      font-family: 'Cormorant Garamond', serif;
      font-size: 2.8rem; font-weight: 600;
      line-height: 1.1;
      margin-bottom: 0.25rem;
      background: linear-gradient(135deg, #fff 40%, rgba(255,255,255,0.7));
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    }
    .verify-subtitle {
      font-size: 0.85rem; color: rgba(255,255,255,0.45);
      margin-bottom: 2rem;
    }
    .verify-divider {
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(201,168,76,0.3), transparent);
      margin: 1.5rem 0;
    }
    .verify-meta { display: flex; flex-direction: column; gap: 0.75rem; }
    .verify-row {
      display: flex; align-items: center; justify-content: space-between;
      font-size: 0.82rem;
    }
    .verify-row-label { color: rgba(255,255,255,0.35); }
    .verify-row-value { color: rgba(255,255,255,0.85); font-weight: 500; }
    .verify-code-display {
      font-family: 'Courier New', monospace;
      font-size: 1.1rem; letter-spacing: 0.15em;
      color: #C9A84C;
      background: rgba(201,168,76,0.08);
      border: 1px solid rgba(201,168,76,0.2);
      border-radius: 8px;
      padding: 0.6rem 1.2rem;
      display: inline-block;
      margin: 1rem 0;
    }
    .verify-status {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      background: rgba(34,197,94,0.1);
      border: 1px solid rgba(34,197,94,0.25);
      border-radius: 12px;
      padding: 0.75rem 1.5rem;
      color: #4ade80;
      font-weight: 600; font-size: 0.9rem;
      margin: 1.5rem 0;
    }
    .pulse-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: #4ade80;
      animation: pulse 1.5s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(0.8); }
    }
    .verify-cta {
      margin-top: 2rem;
      display: flex; flex-direction: column; gap: 0.75rem;
    }
    .btn-main {
      display: inline-block;
      background: linear-gradient(135deg, #8B0000, #C41E3A);
      color: #fff;
      text-decoration: none;
      padding: 0.85rem 1.5rem;
      border-radius: 12px;
      font-weight: 600; font-size: 0.9rem;
      transition: opacity 0.2s;
    }
    .btn-main:hover { opacity: 0.85; }
    .btn-ghost {
      display: inline-block;
      color: rgba(255,255,255,0.45);
      text-decoration: none;
      font-size: 0.8rem;
      transition: color 0.2s;
    }
    .btn-ghost:hover { color: rgba(255,255,255,0.7); }
  </style>
</head>
<body>
  <div class="verify-bg"></div>
  <div class="verify-card">
    <div class="verify-badge">Certificate Verified</div>
    <p class="verify-org">JINBASE Indonesia</p>
    <h1 class="verify-title">${name}</h1>
    <p class="verify-subtitle">${projectLabel}</p>

    <div class="verify-status">
      <div class="pulse-dot"></div>
      Sertifikat Valid &amp; Terverifikasi
    </div>

    <div class="verify-divider"></div>
    <div class="verify-meta">
      <div class="verify-row">
        <span class="verify-row-label">Kode Verifikasi</span>
        <span class="verify-code-display">${code}</span>
      </div>
      <div class="verify-row">
        <span class="verify-row-label">Tipe Kontribusi</span>
        <span class="verify-row-value">${certType}</span>
      </div>
      <div class="verify-row">
        <span class="verify-row-label">Dikeluarkan oleh</span>
        <span class="verify-row-value">JINBASE Indonesia</span>
      </div>
      <div class="verify-row">
        <span class="verify-row-label">Project</span>
        <span class="verify-row-value">BTS JIN PROJECT</span>
      </div>
    </div>

    <div class="verify-cta">
      <a href="/" class="btn-main">🔍 Cari Sertifikat Saya</a>
      <a href="/" class="btn-ghost">← Kembali ke JINBASE</a>
    </div>
  </div>
</body>
</html>`;
}

function buildVerifyNotFoundHtml(code) {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <title>Kode Tidak Valid — JINBASE</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet" />
  <style>
    body { font-family: 'Inter', sans-serif; background: #0a0000; color: #fff; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 2rem; }
    .card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 24px; padding: 3rem; max-width: 480px; text-align: center; }
    h1 { font-size: 1.5rem; margin-bottom: 1rem; }
    p { color: rgba(255,255,255,0.5); margin-bottom: 2rem; font-size: 0.9rem; }
    a { color: #C41E3A; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <div style="font-size:3rem;margin-bottom:1rem;">⚠️</div>
    <h1>Kode Tidak Ditemukan</h1>
    <p>Kode <strong style="color:#C9A84C;font-family:monospace">${escapeHtmlServer(code)}</strong> tidak valid atau tidak ditemukan dalam database JINBASE.</p>
    <a href="/">← Kembali ke JINBASE</a>
  </div>
</body>
</html>`;
}

function escapeHtmlServer(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ------------------------------------------------------------
   ROUTES
------------------------------------------------------------ */

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', contributorsLoaded: contributors.length, codesGenerated: codeMap.size });
});

// ── NEW: Stats endpoint ──────────────────────────────────────
app.get('/api/stats', (req, res) => {
  if (!statsCache) buildStatsCache();
  res.json(statsCache);
});

// ── NEW: JSON verification endpoint ─────────────────────────
app.get('/verify/:code', verifyLimiter, (req, res) => {
  const code = (req.params.code || '').toUpperCase().trim();
  const contributor = codeMap.get(code);

  if (!contributor) {
    return res.status(404).json({
      valid: false,
      error: 'Kode verifikasi tidak ditemukan.',
      code,
    });
  }

  res.json({
    valid: true,
    code,
    name: contributor.name,
    projectLabel: getProjectLabel(contributor),
    contribution_type: contributor.contribution_type || 'money',
    issuedBy: 'JINBASE Indonesia',
    project: 'BTS JIN PROJECT',
  });
});

// ── NEW: OG image for a specific code ───────────────────────
app.get('/v/:code/og-image.png', verifyLimiter, async (req, res) => {
  const code = (req.params.code || '').toUpperCase().trim();
  const contributor = codeMap.get(code);

  if (!contributor) {
    return res.status(404).send('Not found');
  }

  const imgBuffer = await generateOgImage(contributor);
  if (!imgBuffer) {
    return res.status(500).send('Image generation failed');
  }

  res.set({
    'Content-Type': 'image/png',
    'Cache-Control': 'public, max-age=86400', // cache 1 hari
  });
  res.send(imgBuffer);
});

// ── NEW: Public verification page ───────────────────────────
app.get('/v/:code', verifyLimiter, (req, res) => {
  const code = (req.params.code || '').toUpperCase().trim();
  const contributor = codeMap.get(code);

  const baseUrl = `${req.protocol}://${req.get('host')}`;

  if (!contributor) {
    return res.status(404).send(buildVerifyNotFoundHtml(code));
  }

  res.send(buildVerifyHtml(contributor, code, baseUrl));
});

// ── Search (existing, enhanced) ──────────────────────────────
app.post('/api/search', searchLimiter, (req, res) => {
  const { email } = req.body || {};

  if (typeof email !== 'string' || email.trim().length < 3) {
    return res.status(400).json({ error: 'Masukkan minimal 3 karakter email.' });
  }

  const matches = searchContributors(email).slice(0, 10);

  const results = matches.map((c) => {
    const verifyCode = generateVerifyCode(c);
    return {
      id: c.id,
      name: c.name,
      maskedEmail: maskEmail(c.email),
      contribution_type: c.contribution_type || 'money',
      verifyCode,
      projectLabel: getProjectLabel(c),
      amount: c.amount || null,
    };
  });

  return res.json({ results });
});

/* ------------------------------------------------------------
   ADMIN API ENDPOINTS (OWNER SECURE ACCESS)
------------------------------------------------------------ */

// 1. Admin Login
app.post('/api/admin/login', adminAuthLimiter, async (req, res) => {
  await ensureAdminConfigLoaded();
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password wajib diisi.' });
  }

  if (username.trim() !== IMMUTABLE_USERNAME) {
    return res.status(401).json({ error: 'Kredensial login tidak valid.' });
  }

  const hash = hashPassword(password, adminConfig.salt);
  if (hash !== adminConfig.passwordHash) {
    return res.status(401).json({ error: 'Password yang Anda masukkan salah.' });
  }

  const token = createSessionToken();

  return res.json({
    ok: true,
    token,
    username: IMMUTABLE_USERNAME,
    expiresIn: SESSION_TTL_MS / 1000,
    message: 'Login berhasil. Selamat datang di Panel Pemilik JINBASE.'
  });
});

// 2. Admin Logout
app.post('/api/admin/logout', requireAdminAuth, (req, res) => {
  // Token bersifat stateless; logout dilakukan dengan menghapus token di browser.
  return res.json({ ok: true, message: 'Logout berhasil.' });
});

// 3. Admin Check Session
app.get('/api/admin/me', requireAdminAuth, async (req, res) => {
  await ensureAdminConfigLoaded();
  if (!statsCache) buildStatsCache();
  return res.json({
    ok: true,
    username: IMMUTABLE_USERNAME,
    stats: statsCache,
    serverTime: new Date().toISOString()
  });
});

// 4. Admin Change Password (in dashboard)
app.post('/api/admin/change-password', requireAdminAuth, async (req, res) => {
  await ensureAdminConfigLoaded();
  const { currentPassword, newPassword } = req.body || {};

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Password saat ini dan password baru wajib diisi.' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password baru minimal 6 karakter.' });
  }

  const currentHash = hashPassword(currentPassword, adminConfig.salt);
  if (currentHash !== adminConfig.passwordHash) {
    return res.status(400).json({ error: 'Password saat ini tidak cocok.' });
  }

  // Update password & generate salt baru
  const newSalt = crypto.randomBytes(16).toString('hex');
  adminConfig.salt = newSalt;
  adminConfig.passwordHash = hashPassword(newPassword, newSalt);
  adminConfig.updatedAt = new Date().toISOString();

  await saveAdminConfig();

  return res.json({
    ok: true,
    message: 'Password berhasil diperbarui dengan aman.'
  });
});

// 5. Admin Forgot Password (with Recovery Key)
app.post('/api/admin/forgot-password', adminAuthLimiter, async (req, res) => {
  await ensureAdminConfigLoaded();
  const { recoveryKey, newPassword } = req.body || {};

  if (!recoveryKey || !newPassword) {
    return res.status(400).json({ error: 'Recovery key dan password baru wajib diisi.' });
  }

  const cleanKey = recoveryKey.trim().toUpperCase();
  if (cleanKey !== (adminConfig.recoveryKey || '').toUpperCase()) {
    return res.status(400).json({ error: 'Recovery Key tidak valid. Periksa kembali kunci pemulihan Anda.' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password baru minimal 6 karakter.' });
  }

  // Generate new salt, new password hash, and new recovery key
  const newSalt = crypto.randomBytes(16).toString('hex');
  const nextRecoveryKey = generateRandomKey();

  adminConfig.salt = newSalt;
  adminConfig.passwordHash = hashPassword(newPassword, newSalt);
  adminConfig.recoveryKey = nextRecoveryKey;
  adminConfig.updatedAt = new Date().toISOString();

  await saveAdminConfig();

  // Signed stateless sessions are invalidated automatically because passwordHash changed.

  return res.json({
    ok: true,
    message: 'Password berhasil direset. Silakan login dengan password baru Anda.',
    newRecoveryKey: nextRecoveryKey
  });
});

// 6. Get Current Recovery Key (for authenticated admin)
app.get('/api/admin/recovery-key', requireAdminAuth, async (req, res) => {
  await ensureAdminConfigLoaded();
  return res.json({
    ok: true,
    recoveryKey: adminConfig.recoveryKey || 'JB-RECOVERY-DEFAULT',
    username: IMMUTABLE_USERNAME
  });
});

// 7. Regenerate Recovery Key (for authenticated admin)
app.post('/api/admin/regenerate-recovery-key', requireAdminAuth, async (req, res) => {
  await ensureAdminConfigLoaded();
  const nextRecoveryKey = generateRandomKey();
  adminConfig.recoveryKey = nextRecoveryKey;
  adminConfig.updatedAt = new Date().toISOString();
  await saveAdminConfig();

  return res.json({
    ok: true,
    recoveryKey: nextRecoveryKey,
    message: 'Recovery Key baru berhasil dibuat. Simpan kunci ini di tempat yang aman.'
  });
});

// 8. Admin Get Contributors List (with Search, Filter, Pagination)
app.get('/api/admin/contributors', requireAdminAuth, (req, res) => {
  const query = (req.query.q || '').trim().toLowerCase();
  const type = (req.query.type || 'all').toLowerCase();
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.max(1, Math.min(200, parseInt(req.query.limit || '50', 10)));
  const sort = req.query.sort || 'id'; // 'id', 'name', 'amount'
  const order = req.query.order === 'asc' ? 'asc' : 'desc';

  let filtered = [...contributors];

  // Filter type
  if (type === 'money') {
    filtered = filtered.filter(c => c.contribution_type !== 'merchandise');
  } else if (type === 'merchandise') {
    filtered = filtered.filter(c => c.contribution_type === 'merchandise');
  }

  // Filter search
  if (query) {
    const qKey = stripKey(query);
    filtered = filtered.filter(c => {
      const name = (c.name || '').toLowerCase();
      const email = (c.email || '').toLowerCase();
      const id = String(c.id || '').toLowerCase();
      const code = generateVerifyCode(c).toLowerCase();

      return name.includes(query) ||
        email.includes(query) ||
        id.includes(query) ||
        code.includes(query) ||
        (qKey && (stripKey(name).includes(qKey) || stripKey(email).includes(qKey)));
    });
  }

  // Sorting
  filtered.sort((a, b) => {
    let cmp = 0;
    if (sort === 'name') {
      cmp = (a.name || '').localeCompare(b.name || '');
    } else if (sort === 'amount') {
      const amtA = parseInt(a.amount || '0', 10) || 0;
      const amtB = parseInt(b.amount || '0', 10) || 0;
      cmp = amtA - amtB;
    } else {
      // Sort by ID numeric if possible
      const idA = parseInt(a.id || '0', 10);
      const idB = parseInt(b.id || '0', 10);
      if (!isNaN(idA) && !isNaN(idB)) {
        cmp = idA - idB;
      } else {
        cmp = String(a.id || '').localeCompare(String(b.id || ''));
      }
    }
    return order === 'asc' ? cmp : -cmp;
  });

  const total = filtered.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const offset = (page - 1) * limit;
  const paginated = filtered.slice(offset, offset + limit).map(c => ({
    ...c,
    verifyCode: generateVerifyCode(c),
    projectLabel: getProjectLabel(c)
  }));

  if (!statsCache) buildStatsCache();

  return res.json({
    ok: true,
    contributors: paginated,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    },
    stats: statsCache
  });
});

// 9. Admin Add Contributor
app.post('/api/admin/contributors', requireAdminAuth, async (req, res) => {
  const { name, email, contribution_type, amount, id, is_participant } = req.body || {};

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Nama donatur wajib diisi.' });
  }

  if (!email || typeof email !== 'string' || !email.trim() || !email.includes('@')) {
    return res.status(400).json({ error: 'Format email tidak valid.' });
  }

  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();
  const type = (contribution_type === 'merchandise') ? 'merchandise' : 'money';
  let cleanAmount = '0';
  if (type === 'money') {
    const rawAmt = String(amount || '0').replace(/[^0-9]/g, '');
    cleanAmount = rawAmt || '0';
  }

  // Tentukan ID
  let donorId = (id ? String(id).trim() : '');
  if (!donorId) {
    // Generate next sequential numeric ID
    let maxId = 0;
    for (const c of contributors) {
      const num = parseInt(c.id, 10);
      if (!isNaN(num) && num > maxId) maxId = num;
    }
    donorId = String(maxId + 1).padStart(3, '0');
  } else {
    // Cek duplikasi ID
    const exists = contributors.some(c => String(c.id).toLowerCase() === donorId.toLowerCase());
    if (exists) {
      return res.status(400).json({ error: `ID donatur "${donorId}" sudah digunakan.` });
    }
  }

  const newContributor = {
    id: donorId,
    name: cleanName,
    email: cleanEmail,
    search_key: stripKey(cleanName),
    email_search_key: stripKey(cleanEmail),
    contribution_type: type,
    is_participant: is_participant !== false,
    amount: cleanAmount
  };

  // Tambahkan ke database (urutan paling awal atau paling akhir)
  contributors.push(newContributor);
  await saveContributors();

  const code = generateVerifyCode(newContributor);

  return res.status(201).json({
    ok: true,
    contributor: {
      ...newContributor,
      verifyCode: code,
      projectLabel: getProjectLabel(newContributor)
    },
    message: `Donatur "${cleanName}" berhasil ditambahkan ke database.`
  });
});

// 10. Admin Update Contributor
app.put('/api/admin/contributors/:id', requireAdminAuth, async (req, res) => {
  const targetId = String(req.params.id || '').trim();
  const { name, email, contribution_type, amount, is_participant } = req.body || {};

  const idx = contributors.findIndex(c => String(c.id).toLowerCase() === targetId.toLowerCase());
  if (idx === -1) {
    return res.status(404).json({ error: `Donatur dengan ID "${targetId}" tidak ditemukan.` });
  }

  if (name !== undefined) {
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Nama donatur tidak boleh kosong.' });
    }
    contributors[idx].name = name.trim();
    contributors[idx].search_key = stripKey(name.trim());
  }

  if (email !== undefined) {
    if (!email || typeof email !== 'string' || !email.trim() || !email.includes('@')) {
      return res.status(400).json({ error: 'Format email tidak valid.' });
    }
    contributors[idx].email = email.trim().toLowerCase();
    contributors[idx].email_search_key = stripKey(email.trim().toLowerCase());
  }

  if (contribution_type !== undefined) {
    contributors[idx].contribution_type = (contribution_type === 'merchandise') ? 'merchandise' : 'money';
  }

  if (amount !== undefined) {
    if (contributors[idx].contribution_type === 'merchandise') {
      contributors[idx].amount = '0';
    } else {
      contributors[idx].amount = String(amount || '0').replace(/[^0-9]/g, '') || '0';
    }
  }

  if (is_participant !== undefined) {
    contributors[idx].is_participant = !!is_participant;
  }

  await saveContributors();

  const code = generateVerifyCode(contributors[idx]);

  return res.json({
    ok: true,
    contributor: {
      ...contributors[idx],
      verifyCode: code,
      projectLabel: getProjectLabel(contributors[idx])
    },
    message: `Data donatur "${contributors[idx].name}" berhasil diperbarui.`
  });
});

// 11. Admin Delete Contributor
app.delete('/api/admin/contributors/:id', requireAdminAuth, async (req, res) => {
  const targetId = String(req.params.id || '').trim();
  const idx = contributors.findIndex(c => String(c.id).toLowerCase() === targetId.toLowerCase());

  if (idx === -1) {
    return res.status(404).json({ error: `Donatur dengan ID "${targetId}" tidak ditemukan.` });
  }

  const deleted = contributors.splice(idx, 1)[0];
  await saveContributors();

  return res.json({
    ok: true,
    deletedId: targetId,
    deletedName: deleted.name,
    message: `Donatur "${deleted.name}" (ID: ${targetId}) berhasil dihapus dari database.`
  });
});

/* ------------------------------------------------------------
   START
------------------------------------------------------------ */
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 JINBASE API running at http://localhost:${PORT}`);
    console.log(`   /                 — Public search & appreciation certificates`);
    console.log(`   /admin            — Owner / Admin Dashboard (Secret Access)`);
    console.log(`   /api/search       — fuzzy email search`);
    console.log(`   /api/stats        — live stats`);
    console.log(`   /verify/:code     — JSON cert verification`);
    console.log(`   /v/:code          — public verification page`);
    console.log(`   /v/:code/og-image.png — dynamic OG image`);
  });
}

module.exports = app;

