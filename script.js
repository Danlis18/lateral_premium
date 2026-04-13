/* =============================================
   LATERAL — Main Script
   Vanilla JS only, no dependencies
   ============================================= */

// ── Helpers ───────────────────────────────────
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── Theme ─────────────────────────────────────
const themeToggle = $('#themeToggle');

function applyTheme(theme) {
  document.body.setAttribute('data-theme', theme);
  themeToggle?.setAttribute('aria-pressed', String(theme === 'light'));
}

const storedTheme    = localStorage.getItem('lateral-theme');
const systemTheme    = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
applyTheme(storedTheme || systemTheme);

themeToggle?.addEventListener('click', () => {
  const next = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem('lateral-theme', next);
});

// ── Mobile Menu ───────────────────────────────
const menuToggle = $('#menuToggle');
const mobileMenu = $('#mobileMenu');

function closeMenu() {
  mobileMenu?.classList.remove('open');
  mobileMenu?.setAttribute('aria-hidden', 'true');
  menuToggle?.setAttribute('aria-expanded', 'false');
}

function openMenu() {
  mobileMenu?.classList.add('open');
  mobileMenu?.setAttribute('aria-hidden', 'false');
  menuToggle?.setAttribute('aria-expanded', 'true');
}

menuToggle?.addEventListener('click', () => {
  mobileMenu?.classList.contains('open') ? closeMenu() : openMenu();
});

$$('a', mobileMenu || document).forEach(link => link.addEventListener('click', closeMenu));

document.addEventListener('click', (e) => {
  if (!mobileMenu || !menuToggle) return;
  if (!mobileMenu.contains(e.target) && !menuToggle.contains(e.target)) closeMenu();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeMenu();
    if ($('#resumeModal')?.classList.contains('is-open')) closeModal();
  }
});

// ── Scroll Reveal ─────────────────────────────
const revealEls = $$('.reveal');

if (!reduceMotion && 'IntersectionObserver' in window) {
  const revealObs = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
  );
  revealEls.forEach((el) => revealObs.observe(el));
} else {
  revealEls.forEach((el) => el.classList.add('is-visible'));
}

// ── Bar Chart Animation ────────────────────────
const animatedCharts = new Set();

function animateChart(chart) {
  if (!chart || animatedCharts.has(chart)) return;
  animatedCharts.add(chart);
  chart.classList.add('animate');
}

// Observe charts that are already visible (e.g. default football panel)
if (!reduceMotion && 'IntersectionObserver' in window) {
  const chartObs = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animateChart(entry.target);
          chartObs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.4 }
  );

  $$('.analytics-chart').forEach((chart) => {
    // Only observe charts inside visible panels
    const panel = chart.closest('.channel-panel');
    if (!panel || panel.classList.contains('is-visible')) {
      chartObs.observe(chart);
    }
  });
}

// ── Channel Tabs ──────────────────────────────
const tabs   = $$('.channel-item');
const panels = $$('.channel-panel');
let switching = false;

function activateChannel(id, shouldScroll = false) {
  if (switching) return;

  const nextPanel = $(`.channel-panel[data-panel="${id}"]`);
  if (!nextPanel) return;

  // Already active? Skip
  if (nextPanel.classList.contains('is-visible')) return;

  switching = true;

  // Update tab states immediately
  tabs.forEach((tab) => {
    const active = tab.dataset.channel === id;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });

  // Hide all panels, then show target
  panels.forEach((panel) => {
    if (panel !== nextPanel) {
      panel.classList.remove('is-visible');
      panel.setAttribute('hidden', '');
    }
  });

  // Show new panel
  nextPanel.removeAttribute('hidden');
  // Force reflow so the animation triggers
  nextPanel.getBoundingClientRect();
  nextPanel.classList.add('is-visible');

  // Animate any chart inside this panel
  const chart = nextPanel.querySelector('.analytics-chart');
  if (chart && !reduceMotion) {
    setTimeout(() => animateChart(chart), 120);
  }

  // Update sport card active states
  $$('.sport-card[data-target]').forEach((card) => {
    card.classList.toggle('active', card.dataset.target === id);
  });

  switching = false;

  if (shouldScroll) {
    const channelsSection = $('#channels');
    if (channelsSection) {
      channelsSection.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'start',
      });
    }
  }
}

// Tab click
tabs.forEach((tab) => {
  tab.addEventListener('click', () => activateChannel(tab.dataset.channel));

  // Keyboard navigation (arrow keys for tab list)
  tab.addEventListener('keydown', (e) => {
    const list = tabs;
    const idx  = list.indexOf(tab);
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      const next = list[(idx + 1) % list.length];
      next.focus();
      activateChannel(next.dataset.channel);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev = list[(idx - 1 + list.length) % list.length];
      prev.focus();
      activateChannel(prev.dataset.channel);
    }
  });
});

// ── Sport Cards (categories section) ──────────
$$('.sport-card').forEach((card) => {
  const btn = card.querySelector('.btn-toggle');

  // Expand toggle button
  if (btn) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = card.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(isOpen));
      btn.textContent = isOpen ? 'Сховати' : 'Детальніше';
    });
  }

  // Card click → scroll to & activate channel
  card.addEventListener('click', (e) => {
    if (e.target.closest('.btn-toggle') || e.target.closest('.btn-analytics')) return;
    const target = card.dataset.target;
    if (target) activateChannel(target, true);
  });
});

// "Go to channel" links inside sport cards
$$('[data-activate]').forEach((el) => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    const id = el.dataset.activate;
    if (id) activateChannel(id, true);
  });
});

// ── Vacancies — expand/collapse ────────────────
$$('.vacancy-card').forEach((card) => {
  const toggleBtn = card.querySelector('.btn-vacancy-toggle');
  const details   = card.querySelector('.vacancy-details');
  if (!toggleBtn || !details) return;

  toggleBtn.addEventListener('click', () => {
    const isOpen = card.classList.toggle('open');
    toggleBtn.setAttribute('aria-expanded', String(isOpen));
    toggleBtn.textContent = isOpen ? 'Сховати' : 'Детальніше';
  });
});

// ── Resume Modal ──────────────────────────────
const modal          = $('#resumeModal');
const modalTitle     = $('#modalTitle');
const positionLabel  = $('#modalPositionLabel');
const resumeForm     = $('#resumeForm');
const resumeMessage  = $('#resumeMessage');
const charCountEl    = $('#charCount');
const fileDropZone   = $('#fileDropZone');
const fileInput      = $('#resumeFile');
const fileNameEl     = $('#fileNameDisplay');

// Holds the selected file regardless of how it was picked (click or drag-and-drop).
// Acts as a guaranteed fallback when DataTransfer API is unavailable.
let selectedFile = null;

function openModal(position) {
  if (!modal) return;

  // Set position context
  const pos = position || 'LATERAL';
  if (positionLabel) positionLabel.textContent = pos;
  if (modalTitle)    modalTitle.textContent    = `Надіслати резюме`;

  // Populate hidden field so /api/job receives the vacancy name
  const posInput = document.getElementById('resumePosition');
  if (posInput) posInput.value = pos;

  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  // Focus the first focusable element after animation
  setTimeout(() => {
    const focusable = modal.querySelector('button, input, textarea, [tabindex]');
    focusable?.focus();
  }, 320);
}

function closeModal() {
  if (!modal) return;
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

// Open via "Надіслати резюме" buttons
$$('.btn-send-resume').forEach((btn) => {
  btn.addEventListener('click', () => openModal(btn.dataset.position));
});

// Close triggers
$('.modal-close', modal)?.addEventListener('click', closeModal);
$('.modal-cancel', modal)?.addEventListener('click', closeModal);
$('.modal-backdrop', modal)?.addEventListener('click', closeModal);

// Trap focus inside modal when open
modal?.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab' || !modal.classList.contains('is-open')) return;

  const focusables = $$('button, input, textarea, [tabindex="0"]', modal).filter(
    (el) => !el.disabled && el.tabIndex >= 0
  );
  if (!focusables.length) return;

  const first = focusables[0];
  const last  = focusables[focusables.length - 1];

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});

// ── Character counter ──────────────────────────
resumeMessage?.addEventListener('input', () => {
  const count = resumeMessage.value.length;
  if (charCountEl) {
    charCountEl.textContent = count;
    charCountEl.style.color = count > 900 ? 'var(--accent-2)' : '';
  }
});

// ── File upload UI ────────────────────────────
function handleFileSelected(file) {
  if (!file) return;
  selectedFile = file;                          // always store reference as fallback
  if (fileNameEl) fileNameEl.textContent = file.name;
  fileDropZone?.classList.add('has-file');
}

// ── Click on drop zone → open native file picker ──
// The custom UI (SVG + text) overlays the input, so clicks on it never reach the
// input directly. Forward them programmatically.
fileDropZone?.addEventListener('click', (e) => {
  if (e.target === fileInput) return;           // input click is already handled natively
  fileInput?.click();
});

fileInput?.addEventListener('change', () => {
  handleFileSelected(fileInput.files[0] || null);
});

// ── Drag-and-drop ─────────────────────────────
fileDropZone?.addEventListener('dragover', (e) => {
  e.preventDefault();
  fileDropZone.classList.add('drag-over');
});
fileDropZone?.addEventListener('dragleave', (e) => {
  if (!fileDropZone.contains(e.relatedTarget)) {
    fileDropZone.classList.remove('drag-over');
  }
});
fileDropZone?.addEventListener('drop', (e) => {
  e.preventDefault();
  fileDropZone.classList.remove('drag-over');
  const file = e.dataTransfer?.files[0];
  if (file) {
    // Store directly in selectedFile — do NOT touch fileInput.files.
    // Assigning fileInput.files via DataTransfer is unreliable across browsers
    // and completely unsupported on mobile. selectedFile is the only source of truth.
    handleFileSelected(file);
  }
});

// ── Resume form → Telegram ────────────────────
resumeForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = resumeForm.querySelector('[type="submit"]');

  // Read values for validation (FormData constructed below for the actual request)
  const name    = resumeForm.querySelector('[name="name"]')?.value.trim()    || '';
  const contact = resumeForm.querySelector('[name="contact"]')?.value.trim() || '';
  const message = resumeForm.querySelector('[name="message"]')?.value.trim() || '';

  if (!name || !contact || !message) {
    alert('Будь ласка, заповніть усі поля.');
    return;
  }

  console.log('[resume form] selectedFile:', selectedFile, 'name:', name, 'contact:', contact, 'message:', message);

  if (submitBtn) { submitBtn.textContent = 'Надсилаємо…'; submitBtn.disabled = true; }

  // Build FormData manually — direct and reliable on all devices.
  // Never use new FormData(form): it reads fileInput.files which is
  // unreliable for drag-and-drop and broken on mobile browsers.
  const position = resumeForm.querySelector('[name="position"]')?.value || '';
  const formData = new FormData();
  formData.append('name',    name);
  formData.append('contact', contact);
  formData.append('message', message);
  formData.append('position', position);
  if (selectedFile) {
    formData.append('file', selectedFile, selectedFile.name);
  }

  try {
    const res  = await fetch('http://localhost:3000/api/job', {
      method: 'POST',
      body:   formData,
    });

    const raw  = await res.text();
    const data = raw ? JSON.parse(raw) : {};

    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    if (submitBtn) submitBtn.textContent = 'Надіслано!';

    setTimeout(() => {
      closeModal();
      setTimeout(() => {
        resumeForm.reset();
        selectedFile = null;
        if (fileNameEl)   fileNameEl.textContent  = '';
        if (charCountEl)  charCountEl.textContent  = '0';
        if (charCountEl)  charCountEl.style.color  = '';
        if (submitBtn)    { submitBtn.textContent = 'Надіслати'; submitBtn.disabled = false; }
        fileDropZone?.classList.remove('has-file');
      }, 350);
    }, 800);

  } catch (err) {
    console.error('[resume form]', err);
    if (submitBtn) { submitBtn.textContent = 'Надіслати'; submitBtn.disabled = false; }
    alert('Помилка: ' + err.message);
  }
});

// ── Contact form → Telegram ───────────────────
const contactForm = $('.contact-form');
contactForm?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const btn     = contactForm.querySelector('[type="submit"]');
  const name    = contactForm.querySelector('[name="name"]')?.value.trim()    || '';
  const contact = contactForm.querySelector('[name="contact"]')?.value.trim() || '';
  const message = contactForm.querySelector('[name="message"]')?.value.trim() || '';

  if (!name || !contact || !message) {
    alert('Будь ласка, заповніть усі поля.');
    return;
  }

  if (btn) { btn.textContent = 'Відправляємо…'; btn.disabled = true; }

  try {
    const res  = await fetch('http://localhost:3000/api/contact', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, contact, message }),
    });

    const raw  = await res.text();
    const data = raw ? JSON.parse(raw) : {};

    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    if (btn) btn.textContent = 'Надіслано!';
    contactForm.reset();
    setTimeout(() => {
      if (btn) { btn.textContent = 'Надіслати запит'; btn.disabled = false; }
    }, 3000);

  } catch (err) {
    console.error('[contact form]', err);
    if (btn) { btn.textContent = 'Надіслати запит'; btn.disabled = false; }
    alert('Помилка: ' + err.message);
  }
});

// ── Active nav link highlight on scroll ───────
const sections   = $$('section[id]');
const navLinks   = $$('.desktop-nav a');

if ('IntersectionObserver' in window && navLinks.length) {
  const navObs = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          navLinks.forEach((link) => {
            link.style.color = link.getAttribute('href') === `#${id}` ? 'var(--text)' : '';
          });
        }
      });
    },
    { threshold: 0.35, rootMargin: '-80px 0px -50% 0px' }
  );
  sections.forEach((section) => navObs.observe(section));
}
