/**
 * JINBASE E-Certificate — app.js
 * Application Logic: Search, Fuzzy Match, Animations, Download
 */

/* ============================================================
   BACKEND API CONFIG
   ============================================================
   Semua data kontributor & logika pencarian sekarang hidup di
   server (lihat /server/server.js), bukan di browser. app.js
   hanya mengirim query dan menampilkan hasil yang dikembalikan.
   Ganti API_BASE_URL sesuai alamat server kamu saat deploy.
   ============================================================ */
const API_BASE_URL = window.JINBASE_API_URL || 'http://localhost:3000';

let dataLoaded = true; // tidak ada lagi database yang perlu dimuat di client
let currentContributor = null;

/**
 * Kirim query ke backend dan kembalikan array hasil
 * (name, maskedEmail, contribution_type, id).
 * Return array kosong jika tidak ada hasil atau request gagal.
 */
async function searchContributors(query) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: query }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    return Array.isArray(data.results) ? data.results : [];
  } catch (err) {
    console.error('❌ Search request failed:', err);
    const errEl = document.getElementById('search-error');
    if (errEl) {
      errEl.textContent = 'Tidak bisa terhubung ke server. Coba lagi sebentar lagi.';
    }
    return [];
  }
}

/* ============================================================
   SCREEN MANAGEMENT
   ============================================================ */

const screens = {
  landing: document.getElementById('screen-landing'),
  loading: document.getElementById('screen-loading'),
  notfound: document.getElementById('screen-notfound'),
  certificate: document.getElementById('screen-certificate'),
};

function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    if (!el) return;
    el.classList.remove('active', 'exit');
    if (key === name) {
      // Small delay to trigger CSS transition properly
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

  // Validate
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

  // Show loading (sekarang menunggu response ASLI dari server, bukan delay palsu)
  showScreen('loading');

  const minLoadingTime = new Promise(resolve => setTimeout(resolve, 800));
  const [results] = await Promise.all([
    searchContributors(query),
    minLoadingTime, // tetap beri jeda kecil agar animasi loading tidak "berkedip"
  ]);

  if (results.length === 0) {
    showScreen('notfound');
  } else if (results.length === 1) {
    showCertificate(results[0]);
  } else {
    // Multiple matches – show disambiguation modal
    showMultipleResults(results);
  }
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

  // Clean reset — NEVER touch style.transition, let CSS handle everything
  const flipCard = document.getElementById('flip-card');
  const scene = document.getElementById('flip-card-scene');
  const certActions = document.getElementById('cert-actions');
  const flipPrompt = document.getElementById('card-flip-prompt');

  if (flipCard) flipCard.classList.remove('flipped');
  if (scene) scene.classList.remove('has-flipped', 'card-entrance', 'awaiting-click');
  if (certActions) certActions.classList.remove('visible');
  if (flipPrompt) flipPrompt.classList.remove('hidden');

  hasFlipped = false;

  // 1. Show screen (fades in over 500ms)
  showScreen('certificate');

  // 2. After screen is visible, play entrance animation on scene wrapper
  setTimeout(() => {
    if (!scene) return;
    scene.classList.add('card-entrance');

    // 3. After entrance (850ms animation), remove it and enable clicking
    setTimeout(() => {
      scene.classList.remove('card-entrance');
      scene.classList.add('awaiting-click');
    }, 900);
  }, 550); // 550ms: wait for screen fade-in (500ms) + tiny buffer
}

let hasFlipped = false;

function flipCardToReveal() {
  if (hasFlipped) return;
  const flipCard = document.getElementById('flip-card');
  if (!flipCard) return;

  hasFlipped = true;

  // Simply add flipped class — CSS transition does the rest
  flipCard.classList.add('flipped');

  // Update scene state
  const scene = document.getElementById('flip-card-scene');
  if (scene) {
    scene.classList.remove('awaiting-click');
    scene.classList.add('has-flipped');
  }

  const flipPrompt = document.getElementById('card-flip-prompt');
  if (flipPrompt) {
    flipPrompt.classList.add('hidden');
  }

  // Show download buttons after flip animation completes
  const certActions = document.getElementById('cert-actions');
  if (certActions) {
    setTimeout(() => certActions.classList.add('visible'), 900);
  }
}

/* ============================================================
   MULTIPLE RESULTS MODAL
   ============================================================ */

function showMultipleResults(results) {
  showScreen('certificate');

  const modal = document.getElementById('multiple-results-modal');
  const list = document.getElementById('modal-list');
  if (!modal || !list) return;

  list.innerHTML = '';
  // Server sudah mengembalikan email dalam bentuk masked (mis. u***@domain.com),
  // jadi client tidak pernah menyentuh email asli sama sekali.
  results.slice(0, 10).forEach(c => {
    const li = document.createElement('li');
    const btn = document.createElement('button');

    btn.innerHTML = `
      <span class="modal-item-name">${escapeHtml(c.name)}</span>
      <span class="modal-item-email">${escapeHtml(c.maskedEmail)}</span>
    `;
    btn.onclick = () => {
      modal.style.display = 'none';
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
   DOWNLOAD (PDF via jsPDF + html2canvas)
   ============================================================ */

async function downloadCertificate() {
  if (!currentContributor) return;

  const btn = document.getElementById('btn-download');
  const certEl = document.getElementById('certificate');

  if (!certEl) return;

  if (btn) {
    btn.classList.add('loading');
    const originalText = btn.innerHTML;
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" style="animation: spin 1s linear infinite;">
        <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
        <path d="M12 2a10 10 0 0 1 10 10"/>
      </svg>
      Generating PDF...
    `;

    let cloneContainer = null;

    try {
      const targetWidth = 1677;
      const targetHeight = 1191;

      cloneContainer = document.createElement('div');
      cloneContainer.style.position = 'fixed';
      cloneContainer.style.left = '-99999px';
      cloneContainer.style.top = '0';
      cloneContainer.style.width = `${targetWidth}px`;
      cloneContainer.style.height = `${targetHeight}px`;
      cloneContainer.style.overflow = 'hidden';
      cloneContainer.style.margin = '0';
      cloneContainer.style.padding = '0';
      cloneContainer.style.border = 'none';
      cloneContainer.style.borderRadius = '0';
      cloneContainer.style.backgroundColor = '#ffffff';
      cloneContainer.style.zIndex = '-9999';

      const clonedCert = certEl.cloneNode(true);
      clonedCert.style.width = '100%';
      clonedCert.style.height = '100%';
      clonedCert.style.position = 'relative';
      clonedCert.style.margin = '0';
      clonedCert.style.padding = '0';
      clonedCert.style.border = 'none';
      clonedCert.style.borderRadius = '0';
      clonedCert.style.transform = 'none';
      clonedCert.style.webkitTransform = 'none';
      clonedCert.style.boxShadow = 'none';
      clonedCert.style.background = '#ffffff';

      const clonedImg = clonedCert.querySelector('.cert-bg-img');
      if (clonedImg) {
        clonedImg.style.width = '100%';
        clonedImg.style.height = '100%';
        clonedImg.style.objectFit = 'fill';
        clonedImg.style.display = 'block';
        clonedImg.style.margin = '0';
        clonedImg.style.padding = '0';
        clonedImg.style.border = 'none';
      }

      const clonedName = clonedCert.querySelector('.cert-recipient-name');
      if (clonedName) {
        clonedName.style.fontSize = '115px';
      }
      const clonedVerify = clonedCert.querySelector('.cert-verify-overlay');
      if (clonedVerify) {
        clonedVerify.style.fontSize = '14px';
      }

      cloneContainer.appendChild(clonedCert);
      document.body.appendChild(cloneContainer);

      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }

      const canvas = await html2canvas(clonedCert, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: false,
        width: targetWidth,
        height: targetHeight,
        windowWidth: targetWidth,
        windowHeight: targetHeight,
        x: 0,
        y: 0,
        scrollX: 0,
        scrollY: 0,
      });

      const { jsPDF } = window.jspdf || {};
      if (!jsPDF) {
        throw new Error('jsPDF library is not loaded');
      }

      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgData = canvas.toDataURL('image/jpeg', 0.98);

      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');

      const safeName = (currentContributor.name || 'contributor')
        .replace(/[^a-zA-Z0-9_\- ]/g, '')
        .trim()
        .replace(/\s+/g, '_');

      pdf.save(`Appreciation_Card_${safeName}.pdf`);

    } catch (err) {
      console.error('Download PDF failed:', err);
      alert('Download PDF gagal. Silakan coba lagi sebentar lagi.');
    } finally {
      if (cloneContainer && cloneContainer.parentNode) {
        cloneContainer.parentNode.removeChild(cloneContainer);
      }
      if (btn) {
        btn.classList.remove('loading');
        btn.innerHTML = originalText;
      }
    }
  }
}

/* ============================================================
   RESET / NAVIGATION
   ============================================================ */

function resetSearch() {
  // Hide multiple results modal if open
  const modal = document.getElementById('multiple-results-modal');
  if (modal) modal.style.display = 'none';

  currentContributor = null;
  hasFlipped = false;

  // Reset flip card — no inline style manipulation, CSS handles transitions
  const flipCard = document.getElementById('flip-card');
  if (flipCard) flipCard.classList.remove('flipped');

  // Reset scene
  const scene = document.getElementById('flip-card-scene');
  if (scene) scene.classList.remove('has-flipped', 'card-entrance', 'awaiting-click');

  // Reset cert actions
  const certActions = document.getElementById('cert-actions');
  if (certActions) certActions.classList.remove('visible');

  // Clear search input
  const input = document.getElementById('search-input');
  if (input) {
    input.value = '';
  }

  showScreen('landing');

  // Re-focus search after transition
  setTimeout(() => {
    if (input) input.focus();
  }, 500);
}

/* ============================================================
   LANDING PAGE — FADE-IN ANIMATIONS
   ============================================================ */

function initFadeIns() {
  const fadeElements = document.querySelectorAll('#screen-landing .fade-in');
  // Trigger with staggered delays after a short initial pause
  setTimeout(() => {
    fadeElements.forEach(el => {
      el.classList.add('visible');
    });
  }, 200);

  // Slow ken-burns effect on background
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
      // Clear error on typing
      const errEl = document.getElementById('search-error');
      if (errEl && errEl.textContent) errEl.textContent = '';
    });
  }

  // Flip card click — user must click to reveal the certificate
  const flipCardScene = document.getElementById('flip-card-scene');
  if (flipCardScene) {
    flipCardScene.addEventListener('click', () => {
      if (!hasFlipped) {
        flipCardToReveal();
      }
      // Once flipped, clicking again does nothing (certificate stays open)
    });

    // Keyboard accessibility
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
    const activeScreen = Object.entries(screens).find(
      ([, el]) => el && el.classList.contains('active')
    );
    if (activeScreen && activeScreen[0] !== 'landing') {
      resetSearch();
    }
  }
});
