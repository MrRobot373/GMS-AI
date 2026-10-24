'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Minimal .env loader (no dotenv). Never overrides variables already set in
// the process environment.
// ---------------------------------------------------------------------------
function loadDotEnv(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    return; // no .env file — that is fine
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadDotEnv(path.join(__dirname, '.env'));

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------
const express = require('express');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 4173;
const DATA_DIR = path.join(__dirname, 'data');
const INQUIRY_FILE = path.join(DATA_DIR, 'inquiries.jsonl');

const PROGRAMS = [
  'Interview preparation',
  'Aptitude and reasoning',
  'Communication and workplace skills',
  'Placement support',
  'Not sure yet',
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// In-memory rate limit: more than 5 POSTs from the same IP in 10 minutes → 429
// ---------------------------------------------------------------------------
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 5;
const hits = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const windowStart = now - RATE_WINDOW_MS;
  const recent = (hits.get(ip) || []).filter((t) => t > windowStart);
  if (recent.length >= RATE_MAX) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
function validateInquiry(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return 'Request body must be a JSON object.';
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const program = typeof body.program === 'string' ? body.program.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';

  if (name.length < 1 || name.length > 80) return 'Name is required (1-80 characters).';
  if (!email || email.length > 120 || !EMAIL_RE.test(email)) {
    return 'A valid email address is required.';
  }
  if (phone.length > 20) return 'Phone must be 20 characters or fewer.';
  if (!PROGRAMS.includes(program)) {
    return 'Please choose one of the listed programs.';
  }
  if (message.length < 10 || message.length > 2000) {
    return 'Message must be between 10 and 2000 characters.';
  }
  return null;
}

// ---------------------------------------------------------------------------
// JSONL log — always appended, never contains SMTP secrets
// ---------------------------------------------------------------------------
function appendInquiry(record) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const line = JSON.stringify({
    time: new Date().toISOString(),
    name: record.name,
    email: record.email,
    phone: record.phone,
    program: record.program,
    message: record.message,
  });
  fs.appendFileSync(INQUIRY_FILE, line + '\n', 'utf8');
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------
function smtpConfigured() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

function sendInquiryEmail(record) {
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: process.env.INQUIRY_TO || 'yashbadgujar5415@gmail.com',
    replyTo: record.email,
    subject: `Hiring Academy inquiry from ${record.name}`,
    text: [
      `Name: ${record.name}`,
      `Email: ${record.email}`,
      `Phone: ${record.phone || '(not provided)'}`,
      `Program: ${record.program}`,
      '',
      record.message,
    ].join('\n'),
  });
}

// ---------------------------------------------------------------------------
// POST /api/inquiry
// ---------------------------------------------------------------------------
app.post('/api/inquiry', async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ ok: false, error: 'Too many requests. Please try again later.' });
  }

  const error = validateInquiry(req.body);
  if (error) {
    return res.status(400).json({ ok: false, error });
  }

  const record = {
    name: req.body.name.trim(),
    email: req.body.email.trim(),
    phone: typeof req.body.phone === 'string' ? req.body.phone.trim() : '',
    program: req.body.program.trim(),
    message: req.body.message.trim(),
  };

  // Always save, even if email is not configured or fails.
  appendInquiry(record);

  if (!smtpConfigured()) {
    return res.status(200).json({
      ok: true,
      emailed: false,
      saved: true,
      message: 'Inquiry saved. Email is not configured yet.',
    });
  }

  try {
    await sendInquiryEmail(record);
    return res.status(200).json({
      ok: true,
      emailed: true,
      saved: true,
      message: 'Inquiry sent. We will reply by email.',
    });
  } catch (err) {
    // Saved line stays; do not leak SMTP error details.
    return res.status(502).json({
      ok: false,
      emailed: false,
      saved: true,
      error: 'Could not send email',
    });
  }
});

// Malformed JSON body → 400 JSON instead of an HTML error page.
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, error: 'Request body must be valid JSON.' });
  }
  next(err);
});

app.listen(PORT, () => {
  console.log(`Hiring Academy listening on http://localhost:${PORT}`);
});
