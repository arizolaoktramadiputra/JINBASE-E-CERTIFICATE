/**
 * JINBASE E-Certificate — app.js
 * Application Logic: Search, Fuzzy Match, Animations, Download,
 * Stats Counter, Share, Verification Code, History Screen
 */

/* ============================================================
   BACKEND API CONFIG
   ============================================================ */
const API_BASE_URL = window.JINBASE_API_URL || '';

let dataLoaded = true;
let currentContributor = null;
let historyResults = [];    // multiple contributions from same email
let fromHistory = false;    // true if we came from history screen

/* ============================================================
   SEARCH API & LOCAL DATA ENGINE
   ============================================================ */

function normalizeLocal(str) {
  return (str || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function stripLocalKey(str) {
  return normalizeLocal(str).replace(/[^a-z0-9]/g, '');
}

function maskLocalEmail(email) {
  if (!email) return '';
  const [local, domain] = email.split('@');
  if (!domain) return email;
  return `${local[0]}***@${domain}`;
}

function generateLocalVerifyCode(contributor) {
  const raw = `${contributor.id || ''}:${(contributor.email || '').toLowerCase()}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(i);
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
  return `JB-${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}

async function ensureContributorsLoaded() {
  if (window.CONTRIBUTORS_DATA && Array.isArray(window.CONTRIBUTORS_DATA.contributors) && window.CONTRIBUTORS_DATA.contributors.length > 0) {
    return window.CONTRIBUTORS_DATA.contributors;
  }
  // Fallback: jika window.CONTRIBUTORS_DATA belum ada, coba fetch file JSON
  const paths = ['data/contributors.json', './data/contributors.json', '../data/contributors.json', 'contributors.json'];
  for (const p of paths) {
    try {
      const res = await fetch(p);
      if (res.ok) {
        const json = await res.json();
        const list = Array.isArray(json) ? json : json.contributors;
        if (Array.isArray(list) && list.length > 0) {
          window.CONTRIBUTORS_DATA = { contributors: list };
          return list;
        }
      }
    } catch (_) { }
  }
  return [];
}

async function searchContributorsLocal(query) {
  const list = await ensureContributorsLoaded();
  if (!list || list.length === 0) {
    return [];
  }
  const q = normalizeLocal(query);
  const qKey = stripLocalKey(query);
  if (!q || q.length < 2) return [];

  const exact = [];
  const substring = [];

  for (const c of list) {
    const emailNorm = normalizeLocal(c.email || '');
    const emailKey = stripLocalKey(c.email || '');
    const nameNorm = normalizeLocal(c.name || '');
    const nameKey = stripLocalKey(c.name || '');
    const searchKey = normalizeLocal(c.search_key || '');
    const emailSearchKey = normalizeLocal(c.email_search_key || '');

    if (
      emailNorm === q || emailKey === qKey ||
      nameNorm === q || nameKey === qKey ||
      searchKey === qKey || emailSearchKey === qKey
    ) {
      exact.push(c);
      continue;
    }

    if (
      emailNorm.includes(q) || emailKey.includes(qKey) ||
      nameNorm.includes(q) || nameKey.includes(qKey) ||
      searchKey.includes(qKey) || emailSearchKey.includes(qKey) ||
      q.includes(emailNorm) || (emailKey.length >= 4 && qKey.includes(emailKey))
    ) {
      substring.push(c);
      continue;
    }
  }

  const matches = [...exact, ...substring];
  // Deduplikasi berdasarkan id atau email
  const seen = new Set();
  const deduped = [];
  for (const m of matches) {
    const key = `${m.id}-${m.email}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push({
        ...m,
        maskedEmail: maskLocalEmail(m.email),
        verifyCode: generateLocalVerifyCode(m),
      });
    }
  }

  return deduped;
}

async function searchContributors(query) {
  // 1. Coba request ke Backend API jika tersedia
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); // 2s timeout
    const res = await fetch(`${API_BASE_URL}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: query }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.results) && data.results.length > 0) {
        return data.results;
      }
    }
  } catch (err) {
    // Backend API offline atau tidak jalan, fallback ke data lokal
    console.info('Menggunakan database lokal kontributor.');
  }

  // 2. Fallback pencarian ke dataset lokal
  return await searchContributorsLocal(query);
}

/* ============================================================
   SCREEN MANAGEMENT
   ============================================================ */

const screens = {
  landing: document.getElementById('screen-landing'),
  loading: document.getElementById('screen-loading'),
  notfound: document.getElementById('screen-notfound'),
  certificate: document.getElementById('screen-certificate'),
  history: document.getElementById('screen-history'),
};

function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    if (!el) return;
    el.classList.remove('active', 'exit');
    if (key === name) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.classList.add('active');
        });
      });
    }
  });
}

/* ============================================================
   SEARCH FLOW
   ============================================================ */

async function handleSearch() {
  const input = document.getElementById('search-input');
  const errEl = document.getElementById('search-error');

  if (!input) return;
  const query = input.value.trim();

  errEl.textContent = '';
  if (!query) {
    errEl.textContent = 'Please enter your email address.';
    input.focus();
    return;
  }
  if (query.length < 3) {
    errEl.textContent = 'Please enter at least 3 characters.';
    input.focus();
    return;
  }

  showScreen('loading');

  const minLoadingTime = new Promise(resolve => setTimeout(resolve, 800));
  const [results] = await Promise.all([
    searchContributors(query),
    minLoadingTime,
  ]);

  if (results.length === 0) {
    showScreen('notfound');
  } else if (results.length === 1) {
    fromHistory = false;
    showCertificate(results[0]);
  } else {
    // Cek apakah semua hasil adalah orang yang sama (email sama persis) —
    // jika iya, tampilkan riwayat; jika tidak, tampilkan modal disambiguasi
    const sameEmail = results.every(r => r.maskedEmail === results[0].maskedEmail);
    if (sameEmail && results.length > 1) {
      showHistoryScreen(results);
    } else {
      showMultipleResults(results);
    }
  }
}

/* ============================================================
   HISTORY SCREEN — Riwayat Kontribusi
   ============================================================ */

function showHistoryScreen(results) {
  historyResults = results;

  const titleEl = document.getElementById('history-title');
  const subtitleEl = document.getElementById('history-subtitle');
  const listEl = document.getElementById('history-list');

  if (titleEl) {
    titleEl.textContent = `Riwayat Kontribusi — ${results[0].name}`;
  }
  if (subtitleEl) {
    subtitleEl.textContent = `${results.length} kontribusi ditemukan untuk akun ini 💜`;
  }
  if (listEl) {
    listEl.innerHTML = '';
    results.forEach((c, i) => {
      const card = document.createElement('div');
      card.className = 'history-card';
      card.setAttribute('role', 'listitem');

      const typeIcon = c.contribution_type === 'merchandise' ? '🎁' : '💰';
      const typeBadge = c.contribution_type === 'merchandise' ? 'Merchandise' : 'Dana';
      const amountText = c.amount
        ? `Rp ${Number(c.amount).toLocaleString('id-ID')}`
        : '';

      card.innerHTML = `
        <div class="history-card-left">
          <div class="history-card-icon" aria-hidden="true">${typeIcon}</div>
          <div class="history-card-info">
            <p class="history-card-project">${escapeHtml(c.projectLabel || 'BTS JIN PROJECT')}</p>
            <p class="history-card-name">${escapeHtml(c.name)}</p>
            ${amountText ? `<p class="history-card-amount">${amountText}</p>` : ''}
          </div>
        </div>
        <div class="history-card-right">
          <span class="history-card-badge history-card-badge--${c.contribution_type || 'money'}">${typeBadge}</span>
          <button class="btn-history-view" data-index="${i}" aria-label="Lihat sertifikat ${escapeHtml(c.name)}">
            Lihat Sertifikat
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
            </svg>
          </button>
        </div>
      `;

      card.querySelector('.btn-history-view').addEventListener('click', () => {
        fromHistory = true;
        showCertificate(c);
      });

      listEl.appendChild(card);
    });
  }

  showScreen('history');
}

/* ============================================================
   CERTIFICATE DISPLAY
   ============================================================ */

function showCertificate(contributor) {
  currentContributor = contributor;

  // Set found header text
  const foundNameEl = document.getElementById('found-name-display');
  if (foundNameEl) {
    foundNameEl.textContent = `Here's your certificate, ${contributor.name}!`;
  }

  // Set certificate content
  const certNameEl = document.getElementById('cert-name');
  if (certNameEl) {
    certNameEl.textContent = contributor.name;
  }

  // Set template type
  const certEl = document.getElementById('certificate');
  if (certEl) {
    certEl.classList.remove('template-merchandise', 'template-money');
    certEl.classList.add(
      contributor.contribution_type === 'merchandise'
        ? 'template-merchandise'
        : 'template-money'
    );
  }

  // Update stamp text based on contribution type
  const stampEl = document.getElementById('cert-stamp');
  if (stampEl) {
    const texts = stampEl.querySelectorAll('text');
    if (contributor.contribution_type === 'merchandise') {
      if (texts[0]) texts[0].textContent = 'DONATION';
      if (texts[1]) texts[1].textContent = 'MERCH';
    } else {
      if (texts[0]) texts[0].textContent = 'DONATION';
      if (texts[1]) texts[1].textContent = 'FUNDS';
    }
  }

  // Update cert title based on contribution type
  const certTitleEl = document.getElementById('cert-title');
  if (certTitleEl) {
    certTitleEl.textContent =
      contributor.contribution_type === 'merchandise'
        ? 'AN APPRECIATION CARD'
        : 'APPRECIATION CARD';
  }

  // ── NEW: Set verification code in footer ──
  const verifyCodeEl = document.getElementById('cert-verify-code');
  const verifyLinkEl = document.getElementById('cert-verify-link');
  if (contributor.verifyCode) {
    if (verifyCodeEl) verifyCodeEl.textContent = contributor.verifyCode;
    if (verifyLinkEl) {
      verifyLinkEl.href = `${API_BASE_URL}/v/${contributor.verifyCode}`;
    }
  }

  // ── Show "Back to History" button if from history ──
  const searchAgainBtn = document.getElementById('btn-search-again');
  if (searchAgainBtn) {
    if (fromHistory) {
      searchAgainBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" width="18" height="18">
          <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
        </svg>
        Kembali ke Riwayat
      `;
      searchAgainBtn.onclick = () => showScreen('history');
    } else {
      searchAgainBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" width="18" height="18">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        Search Another Email
      `;
      searchAgainBtn.onclick = resetSearch;
    }
  }

  // Clean reset
  const flipCard = document.getElementById('flip-card');
  const scene = document.getElementById('flip-card-scene');
  const certActions = document.getElementById('cert-actions');
  const flipPrompt = document.getElementById('card-flip-prompt');

  if (flipCard) {
    flipCard.classList.remove('flipped', 'is-tilting');
    resetCardTilt();
  }
  if (scene) scene.classList.remove('has-flipped', 'card-entrance', 'awaiting-click');
  if (certActions) certActions.classList.remove('visible');
  if (flipPrompt) flipPrompt.classList.remove('hidden');

  hasFlipped = false;

  showScreen('certificate');

  setTimeout(() => {
    if (!scene) return;
    scene.classList.add('card-entrance');

    setTimeout(() => {
      scene.classList.remove('card-entrance');
      scene.classList.add('awaiting-click');
    }, 900);
  }, 550);
}

/* ============================================================
   PREMIUM 3D FLIP CARD — Dynamic Tilt, Shine & Interaction
   ============================================================ */

let hasFlipped = false;

function resetCardTilt() {
  const flipCard = document.getElementById('flip-card');
  if (!flipCard) return;
  flipCard.classList.remove('is-tilting');
  flipCard.style.setProperty('--tilt-x', '0deg');
  flipCard.style.setProperty('--tilt-y', '0deg');
  flipCard.style.setProperty('--shine-x', '50%');
  flipCard.style.setProperty('--shine-y', '50%');
}

function initCard3DInteractions() {
  const scene = document.getElementById('flip-card-scene');
  const card = document.getElementById('flip-card');
  if (!scene || !card) return;

  function handlePointerMove(e) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = scene.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    // Relative mouse position inside scene [0 .. 1]
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    const clampedX = Math.max(0, Math.min(1, x));
    const clampedY = Math.max(0, Math.min(1, y));

    // Dynamic tilt calculation
    const maxTiltX = 8; // degrees
    const maxTiltY = 14; // degrees

    const tiltX = (0.5 - clampedY) * (maxTiltX * 2);
    // Reverse Y rotation when card is flipped so tilting feels physically correct
    const tiltY = (clampedX - 0.5) * (maxTiltY * 2) * (hasFlipped ? -1 : 1);

    card.classList.add('is-tilting');
    card.style.setProperty('--tilt-x', `${tiltX.toFixed(2)}deg`);
    card.style.setProperty('--tilt-y', `${tiltY.toFixed(2)}deg`);
    card.style.setProperty('--shine-x', `${(clampedX * 100).toFixed(1)}%`);
    card.style.setProperty('--shine-y', `${(clampedY * 100).toFixed(1)}%`);
  }

  scene.addEventListener('pointermove', handlePointerMove);
  scene.addEventListener('pointerleave', resetCardTilt);
  scene.addEventListener('pointercancel', resetCardTilt);
}

function flipCardToReveal() {
  if (hasFlipped) return;
  const flipCard = document.getElementById('flip-card');
  if (!flipCard) return;

  hasFlipped = true;
  resetCardTilt();
  flipCard.classList.remove('is-tilting');
  flipCard.classList.add('flipped');

  const scene = document.getElementById('flip-card-scene');
  if (scene) {
    scene.classList.remove('awaiting-click');
    scene.classList.add('has-flipped');
  }

  const flipPrompt = document.getElementById('card-flip-prompt');
  if (flipPrompt) {
    flipPrompt.classList.add('hidden');
  }

  const certActions = document.getElementById('cert-actions');
  if (certActions) {
    setTimeout(() => certActions.classList.add('visible'), 900);
  }
}

/* ============================================================
   MULTIPLE RESULTS MODAL (disambiguasi nama berbeda)
   ============================================================ */

function showMultipleResults(results) {
  showScreen('certificate');

  const modal = document.getElementById('multiple-results-modal');
  const list = document.getElementById('modal-list');
  if (!modal || !list) return;

  list.innerHTML = '';
  results.slice(0, 10).forEach(c => {
    const li = document.createElement('li');
    const btn = document.createElement('button');

    btn.innerHTML = `
      <span class="modal-item-name">${escapeHtml(c.name)}</span>
      <span class="modal-item-email">${escapeHtml(c.maskedEmail)}</span>
    `;
    btn.onclick = () => {
      modal.style.display = 'none';
      fromHistory = false;
      showCertificate(c);
    };
    li.appendChild(btn);
    list.appendChild(li);
  });

  modal.style.display = 'flex';
}

function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ============================================================
   DOWNLOAD (High-Definition Direct Canvas 2D -> PDF via jsPDF)
   No DOM cloning / html2canvas dependency for 100% reliable
   rendering on iOS Safari, Chrome iOS, Android, and Desktop.
   ============================================================ */

async function downloadCertificate() {
  if (!currentContributor) return;

  const btn = document.getElementById('btn-download');
  const originalHTML = btn ? btn.innerHTML : '';

  if (btn) {
    btn.classList.add('loading');
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" style="animation: spin 1s linear infinite;">
        <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
        <path d="M12 2a10 10 0 0 1 10 10"/>
      </svg>
      Generating PDF...
    `;
  }

  try {
    // ── Dimensi TEPAT proporsional A4 Landscape ──────────────────
    // A4 = 297mm × 210mm, rasio = 297/210 = 1.41428...
    // 297 × 6 = 1782, 210 × 6 = 1260 → kelipatan tepat mm, zero rounding
    const A4_W_MM = 297;
    const A4_H_MM = 210;
    const RENDER_SCALE = 6;  // px per mm
    const targetWidth = A4_W_MM * RENDER_SCALE;  // 1782 px
    const targetHeight = A4_H_MM * RENDER_SCALE;  // 1260 px

    // Pastikan font sudah selesai termuat di browser
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
    try {
      if (document.fonts && document.fonts.load) {
        await Promise.all([
          document.fonts.load('120px "Great Vibes"'),
          document.fonts.load('600 16px "Inter"')
        ]);
      }
    } catch (fontErr) {
      console.warn('Font preload warning:', fontErr);
    }

    // ── 1. Muat background template SVG secara presisi ────────────
    let bgImg = null;
    let blobUrl = null;

    try {
      const svgRes = await fetch('assets-photos/certificate-design.svg');
      if (!svgRes.ok) throw new Error(`HTTP ${svgRes.status}`);
      let svgText = await svgRes.text();

      // Sesuaikan atribut dimensi SVG ke targetWidth & targetHeight agar di-rasterkan secara tajam & penuh
      svgText = svgText
        .replace(/width="[^"]*"/, `width="${targetWidth}"`)
        .replace(/height="[^"]*"/, `height="${targetHeight}"`)
        .replace(/preserveAspectRatio="[^"]*"/, 'preserveAspectRatio="none"');

      const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
      blobUrl = URL.createObjectURL(svgBlob);

      bgImg = new Image();
      bgImg.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        bgImg.onload = () => resolve();
        bgImg.onerror = (e) => reject(new Error('Gagal memuat template SVG via Blob'));
        bgImg.src = blobUrl;
      });
    } catch (fetchErr) {
      console.warn('Direct SVG fetch fallback to image element:', fetchErr);
      // Fallback jika fetch blob terhambat
      const domImg = document.querySelector('.cert-bg-img');
      if (domImg && domImg.complete && domImg.naturalWidth > 0) {
        bgImg = domImg;
      } else {
        bgImg = new Image();
        bgImg.crossOrigin = 'anonymous';
        await new Promise((resolve, reject) => {
          bgImg.onload = () => resolve();
          bgImg.onerror = () => reject(new Error('Gagal memuat gambar sertifikat'));
          bgImg.src = 'assets-photos/certificate-design.svg';
        });
      }
    }

    // ── 2. Render ke 2D Canvas dengan dimensi tepat ───────────────
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d', { alpha: false });

    // Background putih solid
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetWidth, targetHeight);

    // Gambar background SVG template
    ctx.drawImage(bgImg, 0, 0, targetWidth, targetHeight);

    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
    }

    // ── 3. Render Nama Kontributor (Cursive Red Font) ─────────────
    const name = (currentContributor.name || '').trim();
    if (name) {
      const BASE_WIDTH = 1677;
      let fontSize = Math.round(115 * targetWidth / BASE_WIDTH); // ~122px
      const maxWidth = targetWidth * 0.84; // Batas lebar agar tidak melebihi bingkai

      ctx.fillStyle = '#8B0000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${fontSize}px "Great Vibes", "Dancing Script", "Playfair Display", Georgia, cursive`;

      // Auto scale font size jika nama kontributor sangat panjang
      while (ctx.measureText(name).width > maxWidth && fontSize > 36) {
        fontSize -= 3;
        ctx.font = `${fontSize}px "Great Vibes", "Dancing Script", "Playfair Display", Georgia, cursive`;
      }

      // Posisi vertikal nama: top 23% + height 22%/2 = 34.0%
      const nameX = targetWidth / 2;
      const nameY = targetHeight * 0.340;

      ctx.fillText(name, nameX, nameY);
    }

    // ── 4. Render Kode Verifikasi di pojok kanan bawah ────────────
    const verifyCode = currentContributor.verifyCode || '';
    if (verifyCode) {
      const verifyFontSize = Math.max(12, Math.round(13.5 * targetWidth / 1677));
      ctx.font = `600 ${verifyFontSize}px "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      const verifyX = targetWidth - (targetWidth * 0.035);
      const verifyY = targetHeight - (targetHeight * 0.016);
      ctx.fillText(`Kode: ${verifyCode}`, verifyX, verifyY);
    }

    // ── 5. Generate PDF A4 Landscape via jsPDF ────────────────────
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) throw new Error('jsPDF library is not loaded');

    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const pdfW = pdf.internal.pageSize.getWidth();   // 297 mm
    const pdfH = pdf.internal.pageSize.getHeight();  // 210 mm

    const imgData = canvas.toDataURL('image/jpeg', 0.96);

    // x=0, y=0, w=pdfW, h=pdfH → tepat A4, NO white border
    pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, pdfH, '', 'FAST');

    const safeName = (currentContributor.name || 'contributor')
      .replace(/[^a-zA-Z0-9_\- ]/g, '')
      .trim()
      .replace(/\s+/g, '_');

    pdf.save(`Appreciation_Card_${safeName}.pdf`);

  } catch (err) {
    console.error('Download PDF failed:', err);
    alert('Download PDF gagal. Silakan coba lagi sebentar lagi.');
  } finally {
    if (btn) {
      btn.classList.remove('loading');
      btn.innerHTML = originalHTML;
    }
  }
}

/* ============================================================
   SHARE — Web Share API + fallback panel
   ============================================================ */

function getShareUrl() {
  if (!currentContributor || !currentContributor.verifyCode) return window.location.href;
  return `${API_BASE_URL}/v/${currentContributor.verifyCode}`;
}

function getShareText() {
  if (!currentContributor) return 'Sertifikat JINBASE — BTS JIN PROJECT';
  const name = currentContributor.name || '';
  return `Aku salah satu kontributor BTS JIN PROJECT! 💜 Terima kasih JINBASE Indonesia — ${name}`;
}

async function shareToSocial() {
  const shareUrl = getShareUrl();
  const shareText = getShareText();

  // Try Web Share API first (mobile)
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'JINBASE E-Certificate — BTS JIN PROJECT',
        text: shareText,
        url: shareUrl,
      });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return; // user cancelled
    }
  }

  // Fallback: show share panel
  openSharePanel(shareUrl, shareText);
}

function openSharePanel(shareUrl, shareText) {
  const panel = document.getElementById('share-panel');
  const urlText = document.getElementById('share-url-text');
  if (!panel) return;

  if (urlText) urlText.textContent = shareUrl;

  panel.style.display = 'flex';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      panel.classList.add('open');
    });
  });

  // Set up share buttons
  const twitterBtn = document.getElementById('share-twitter');
  const waBtn = document.getElementById('share-whatsapp');
  const copyBtn = document.getElementById('share-copy');

  if (twitterBtn) {
    twitterBtn.onclick = () => {
      const twitterText = encodeURIComponent(`${shareText}\n${shareUrl}`);
      window.open(`https://x.com/intent/tweet?text=${twitterText}`, '_blank', 'noopener');
    };
  }
  if (waBtn) {
    waBtn.onclick = () => {
      const waText = encodeURIComponent(`${shareText}\n${shareUrl}`);
      window.open(`https://wa.me/?text=${waText}`, '_blank', 'noopener');
    };
  }
  if (copyBtn) {
    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(shareUrl);
        const original = copyBtn.innerHTML;
        copyBtn.innerHTML = `✓ Tersalin!`;
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.innerHTML = original;
          copyBtn.classList.remove('copied');
        }, 2000);
      } catch {
        prompt('Salin link ini:', shareUrl);
      }
    };
  }
}

function closeSharePanel() {
  const panel = document.getElementById('share-panel');
  if (!panel) return;
  panel.classList.remove('open');
  setTimeout(() => {
    panel.style.display = 'none';
  }, 350);
}

/* ============================================================
   LIVE STATS COUNTER
   ============================================================ */

async function fetchStats() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${API_BASE_URL}/api/stats`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    // Fallback to local dataset stats
  }

  if (window.CONTRIBUTORS_DATA && Array.isArray(window.CONTRIBUTORS_DATA.contributors)) {
    let totalFunds = 0;
    let totalMerchandise = 0;
    let totalMoney = 0;
    for (const c of window.CONTRIBUTORS_DATA.contributors) {
      if (c.contribution_type === 'merchandise') {
        totalMerchandise++;
      } else {
        totalMoney++;
        const amt = parseInt(c.amount || '0', 10);
        if (!isNaN(amt)) totalFunds += amt;
      }
    }
    return {
      totalContributors: window.CONTRIBUTORS_DATA.contributors.length,
      totalFunds,
      totalMoney,
      totalMerchandise,
    };
  }

  return null;
}

/**
 * Animate a number from 0 to target with easing.
 * Calls onUpdate(currentValue) each frame, onDone() when finished.
 */
function animateCount(target, duration, onUpdate, formatter) {
  const start = performance.now();
  const fmt = formatter || (v => Math.round(v).toLocaleString('id-ID'));

  function step(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // Ease-out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    onUpdate(fmt(target * eased));
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

async function initStats() {
  const stats = await fetchStats();
  if (!stats) return;

  const strip = document.getElementById('stats-strip');
  if (strip) strip.classList.add('loaded');

  const cEl = document.getElementById('stat-contributors');
  const fEl = document.getElementById('stat-funds');
  const mEl = document.getElementById('stat-merch');

  if (cEl && stats.totalContributors) {
    animateCount(stats.totalContributors, 1800, v => { cEl.textContent = v; });
  }

  if (fEl && stats.totalFunds) {
    animateCount(stats.totalFunds, 2200, v => { fEl.textContent = v; }, v => {
      const millions = (stats.totalFunds * (Math.min((performance.now()) / 2200, 1))) / 1_000_000;
      // Format as Rp X.XXjt while animating
      return `Rp ${Math.round(stats.totalFunds * parseFloat(v) / stats.totalFunds / 1_000_000 * 100) / 100}jt`;
    });
    // Simpler approach: just animate the number directly
    animateCount(
      stats.totalFunds / 1_000_000,
      2200,
      v => {
        fEl.textContent = `Rp ${parseFloat(v).toFixed(1)}jt`;
      },
      v => `${parseFloat(v).toFixed(1)}`
    );
  } else if (fEl) {
    fEl.textContent = 'Rp —';
  }

  if (mEl && stats.totalMerchandise !== undefined) {
    animateCount(stats.totalMerchandise, 1600, v => { mEl.textContent = v; });
  }
}

/* ============================================================
   RESET / NAVIGATION
   ============================================================ */

function resetSearch() {
  const modal = document.getElementById('multiple-results-modal');
  if (modal) modal.style.display = 'none';

  closeSharePanel();

  currentContributor = null;
  historyResults = [];
  fromHistory = false;
  hasFlipped = false;

  const flipCard = document.getElementById('flip-card');
  if (flipCard) {
    flipCard.classList.remove('flipped', 'is-tilting');
    resetCardTilt();
  }

  const scene = document.getElementById('flip-card-scene');
  if (scene) scene.classList.remove('has-flipped', 'card-entrance', 'awaiting-click');

  const certActions = document.getElementById('cert-actions');
  if (certActions) certActions.classList.remove('visible');

  const input = document.getElementById('search-input');
  if (input) input.value = '';

  showScreen('landing');

  setTimeout(() => {
    if (input) input.focus();
  }, 500);
}

/* ============================================================
   LANDING PAGE — FADE-IN ANIMATIONS
   ============================================================ */

function initFadeIns() {
  const fadeElements = document.querySelectorAll('#screen-landing .fade-in');
  setTimeout(() => {
    fadeElements.forEach(el => {
      el.classList.add('visible');
    });
  }, 200);

  const bg = document.querySelector('.hero-bg');
  if (bg) {
    setTimeout(() => bg.classList.add('loaded'), 100);
  }
}

/* ============================================================
   EVENT LISTENERS
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  // Init landing animations
  initFadeIns();

  // Init live stats
  initStats();

  // Init 3D card tilt & shine interactions
  initCard3DInteractions();

  // Search button click
  const searchBtn = document.getElementById('search-btn');
  if (searchBtn) {
    searchBtn.addEventListener('click', handleSearch);
  }

  // Enter key on search input
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSearch();
      }
      const errEl = document.getElementById('search-error');
      if (errEl && errEl.textContent) errEl.textContent = '';
    });
  }

  // Flip card click & keyboard
  const flipCardScene = document.getElementById('flip-card-scene');
  if (flipCardScene) {
    flipCardScene.addEventListener('click', () => {
      if (!hasFlipped) flipCardToReveal();
    });
    flipCardScene.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!hasFlipped) flipCardToReveal();
      }
    });
  }

  // Flip prompt button click & keyboard
  const flipPrompt = document.getElementById('card-flip-prompt');
  if (flipPrompt) {
    flipPrompt.addEventListener('click', () => {
      if (!hasFlipped) flipCardToReveal();
    });
    flipPrompt.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!hasFlipped) flipCardToReveal();
      }
    });
  }

  // Download button
  const downloadBtn = document.getElementById('btn-download');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', downloadCertificate);
  }

  // ── NEW: Share button ──
  const shareBtn = document.getElementById('btn-share');
  if (shareBtn) {
    shareBtn.addEventListener('click', shareToSocial);
  }

  // ── NEW: Share panel close ──
  const shareClose = document.getElementById('share-panel-close');
  if (shareClose) {
    shareClose.addEventListener('click', closeSharePanel);
  }

  const shareBackdrop = document.getElementById('share-panel-backdrop');
  if (shareBackdrop) {
    shareBackdrop.addEventListener('click', closeSharePanel);
  }

  // Close multiple results modal on backdrop click
  const modal = document.getElementById('multiple-results-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
        resetSearch();
      }
    });
  }
});

/* ============================================================
   KEYBOARD SHORTCUT: Escape to go back
   ============================================================ */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    // Close share panel first if open
    const sharePanel = document.getElementById('share-panel');
    if (sharePanel && sharePanel.classList.contains('open')) {
      closeSharePanel();
      return;
    }

    const activeScreen = Object.entries(screens).find(
      ([, el]) => el && el.classList.contains('active')
    );
    if (activeScreen && activeScreen[0] !== 'landing') {
      if (activeScreen[0] === 'certificate' && fromHistory) {
        showScreen('history');
      } else {
        resetSearch();
      }
    }
  }

  // Secret Owner Access Shortcut: Ctrl + Shift + A (or Cmd + Shift + A)
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
    e.preventDefault();
    window.location.href = '/admin';
  }
});

/* ============================================================
   SECRET TRIGGER: Triple click brand badge -> Owner Portal
   ============================================================ */
let badgeClickCount = 0;
let badgeClickTimer = null;
const brandBadge = document.getElementById('fi-badge');
if (brandBadge) {
  brandBadge.style.cursor = 'pointer';
  brandBadge.title = 'JINBASE Indonesia';
  brandBadge.addEventListener('click', () => {
    badgeClickCount++;
    if (badgeClickTimer) clearTimeout(badgeClickTimer);

    if (badgeClickCount >= 3) {
      badgeClickCount = 0;
      window.location.href = '/admin';
      return;
    }

    badgeClickTimer = setTimeout(() => {
      badgeClickCount = 0;
    }, 600);
  });
}

