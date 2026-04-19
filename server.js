'use strict';

// ── Rate limit (anti-spam) ───────────────────
const rateLimitMap = new Map();
const LIMIT = 5; 
const WINDOW = 24 * 60 * 60 * 1000;

const express = require('express');
const cors    = require('cors');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

// ─────────────────────────────────────────────
// Config
// Use env vars in production:
//   BOT_TOKEN=xxx CHAT_ID=yyy node server.js
// ─────────────────────────────────────────────
const BOT_TOKEN = process.env.BOT_TOKEN || '8641200669:AAGr5j2s-jvNdknXfxvIAO3yZRLkqT2Msyg';
const CHAT_ID   = process.env.CHAT_ID   || '-1003942571844';
const PORT      = Number(process.env.PORT) || 3000;

const TELEGRAM_URL = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

// ─────────────────────────────────────────────
// App setup
// ─────────────────────────────────────────────
const app = express();

app.use(cors());                    // allow cross-origin requests during dev

// ── Explicit CORS headers (works even if cors() package is misconfigured) ──
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin',  '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── Debug: log every incoming API request ─────
app.use('/api', (req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`, req.body);
  next();
});

// Serve the static site from the same folder.
// Visit http://localhost:3000 to see the full site.
app.use(express.static(path.join(__dirname)));



function isRateLimited(ip) {
  const now = Date.now();

  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, []);
  }

  const timestamps = rateLimitMap.get(ip);

  // видаляємо старі (старше 24h)
  const filtered = timestamps.filter(ts => now - ts < WINDOW);

  rateLimitMap.set(ip, filtered);

  if (filtered.length >= LIMIT) {
    return true;
  }

  filtered.push(now);
  return false;
}

// ─────────────────────────────────────────────
// Multer — file upload config
// ─────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `resume-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const allowedExts  = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.webp'];
    const allowedMimes = ['application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg', 'image/png', 'image/webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExts.includes(ext) || allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(null, false); // reject silently — body still fully parsed
    }
  },
});

// ─────────────────────────────────────────────
// Helpers: Telegram
// ─────────────────────────────────────────────
async function sendToTelegram(text) {
  const response = await fetch(TELEGRAM_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ chat_id: CHAT_ID, text }),
  });

  const data = await response.json();

  if (!data.ok) {
    throw new Error(`Telegram API error: ${JSON.stringify(data)}`);
  }

  return data;
}

// Send a file to Telegram using sendDocument
async function sendDocumentToTelegram(filePath, filename, mimetype, caption) {
  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([fileBuffer], { type: mimetype });

  const form = new FormData();
  form.append('chat_id', CHAT_ID);
  form.append('caption', caption);
  form.append('document', blob, filename);

  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
    method: 'POST',
    body:   form,
  });

  const data = await response.json();
  if (!data.ok) throw new Error(`Telegram API error: ${JSON.stringify(data)}`);
  return data;
}

// ─────────────────────────────────────────────
// POST /api/contact — contact form submission
// ─────────────────────────────────────────────
app.use('/api/contact', express.json());
app.post('/api/contact', async (req, res) => {
  const { name, contact, message, website } = req.body ?? {};

// 🚨 HONEYPOT
if (website) {
  return res.status(400).json({ ok: false });
}
  
  const ip = req.ip;

  if (isRateLimited(ip)) {
    return res.status(429).json({
      ok: false,
      error: 'Занадто багато запитів. Спробуйте завтра.'
    });
  }

  // Validate
  if (!name?.trim() || !contact?.trim() || !message?.trim()) {
    return res.status(400).json({ ok: false, error: 'Усі поля обов\'язкові' });
  }

  // Format the Telegram message
  const text = [
    '\uD83D\uDCE9 \u041D\u043E\u0432\u0430 \u0437\u0430\u044F\u0432\u043A\u0430 \u0437 \u0441\u0430\u0439\u0442\u0443',
    '',
    `\uD83D\uDC64 \u0406\u043C\'\u044F: ${name.trim()}`,
    `\uD83D\uDCDE \u041A\u043E\u043D\u0442\u0430\u043A\u0442: ${contact.trim()}`,
    '\uD83D\uDCAC \u041F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F:',
    message.trim(),
  ].join('\n');

  try {
    await sendToTelegram(text);
    console.log('[/api/contact] sent to Telegram OK');
    return res.json({ ok: true });
  } catch (err) {
    console.error('[/api/contact] error:', err.message);
    return res.status(502).json({ ok: false, error: 'Помилка відправки в Telegram' });
  }
});

// ─────────────────────────────────────────────
// POST /api/job — vacancy / resume submission
// ─────────────────────────────────────────────
app.post('/api/job', upload.single('file'), async (req, res) => {
 const { name, contact, message, position, website } = req.body ?? {};

// 🚨 HONEYPOT
if (website) {
  return res.status(400).json({ ok: false });
}
  
  const ip = req.ip;

  if (isRateLimited(ip)) {
    return res.status(429).json({
      ok: false,
      error: 'Занадто багато заявок. Спробуйте завтра.'
    });
  }
  // ── Debug ──────────────────────────────────────
  console.log('=== /api/job HIT ===');
  console.log('Content-Type:', req.headers['content-type']);
  console.log('req.body:', JSON.stringify(req.body));
  console.log('req.file:', req.file ?? 'no file');

  // Validate required text fields
  if (!name?.trim() || !contact?.trim() || !message?.trim()) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ ok: false, error: 'Усі поля обов\'язкові' });
  }

  // Build caption (used for both text-only and document send)
  const pos     = position?.trim() || '\u043D\u0435 \u0432\u043A\u0430\u0437\u0430\u043D\u043E'; // "не вказано"
  const caption = [
    '\uD83D\uDCBC \u041D\u043E\u0432\u0430 \u0437\u0430\u044F\u0432\u043A\u0430 (\u0412\u0430\u043A\u0430\u043D\u0441\u0456\u044F)',
    '',
    `\uD83D\uDC64 \u0406\u043C\'\u044F: ${name.trim()}`,
    `\uD83D\uDCDE \u041A\u043E\u043D\u0442\u0430\u043A\u0442: ${contact.trim()}`,
    `\uD83D\uDCCC \u0412\u0430\u043A\u0430\u043D\u0441\u0456\u044F: ${pos}`,
    '\uD83E\uDDE0 \u0414\u043E\u0441\u0432\u0456\u0434:',
    message.trim(),
  ].join('\n');

  try {
    if (req.file) {
      console.log('[/api/job] file received:', req.file.originalname, req.file.size, 'bytes');
      await sendDocumentToTelegram(req.file.path, req.file.originalname, req.file.mimetype, caption);
    } else {
      console.log('[/api/job] no file — sending text only');
      await sendToTelegram(caption);
    }
    console.log('[/api/job] sent to Telegram OK');
    return res.json({ ok: true });
  } catch (err) {
    console.error('[/api/job] error:', err.message);
    return res.status(502).json({ ok: false, error: 'Помилка відправки в Telegram' });
  } finally {
    if (req.file) fs.unlink(req.file.path, () => {});
  }
});

// ── Multer error handler ───────────────────────
// Catches file size / type errors and returns clean JSON
// eslint-disable-next-line no-unused-vars
app.use('/api/job', (err, req, res, next) => {
  if (req.file) fs.unlink(req.file.path, () => {});
  const msg = err.code === 'LIMIT_FILE_SIZE'
    ? 'Файл занадто великий (максимум 10 МБ)'
    : (err.message || 'Помилка завантаження файлу');
  console.error('[multer error]', err.message);
  res.status(400).json({ ok: false, error: msg });
});

// ─────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`LATERAL backend  →  http://localhost:${PORT}`);
  console.log(`Open the site    →  http://localhost:${PORT}/index.html`);
  console.log('Press Ctrl+C to stop.');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[ERROR] Port ${PORT} is already in use.`);
    console.error('Either stop the other process or set a different port:');
    console.error(`  PORT=3001 node server.js\n`);
  } else {
    console.error('[ERROR] Server failed to start:', err.message);
  }
  process.exit(1);
});
