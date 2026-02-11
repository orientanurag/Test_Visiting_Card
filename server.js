const crypto = require('crypto');
const path = require('path');
const express = require('express');
const QRCode = require('qrcode');

const app = express();
const cards = new Map();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use('/static', express.static(path.join(__dirname, 'public')));

function getBaseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}

function sanitizeInput(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function validateCardFields(body) {
  const firstName = sanitizeInput(body.firstName);
  const lastName = sanitizeInput(body.lastName);
  const designation = sanitizeInput(body.designation);
  const errors = [];

  if (!firstName) errors.push('First name is required.');
  if (!lastName) errors.push('Last name is required.');
  if (!designation) errors.push('Designation is required.');

  return { firstName, lastName, designation, errors };
}

function renderPage({ title, content }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <link rel="stylesheet" href="/static/styles.css" />
</head>
<body>
  <main class="container">
    <img src="/static/logo.svg" alt="Acme Co logo" class="logo" />
    ${content}
  </main>
</body>
</html>`;
}

function renderFormPage(errors = [], values = {}) {
  const errorHtml = errors.length
    ? `<div class="error-box"><h2>Please fix the following:</h2><ul>${errors
        .map((error) => `<li>${escapeHtml(error)}</li>`)
        .join('')}</ul></div>`
    : '';

  const content = `
    <section class="glass-panel">
      <span class="chip">Acme Co Digital Identity</span>
      <h1>Virtual Visiting Card Generator</h1>
      <p>Create a clean card image and instantly download a share-ready vCard with QR support.</p>
      ${errorHtml}
      <form method="post" action="/create" novalidate class="form-grid">
        <label>First name<input required name="firstName" value="${escapeHtml(values.firstName || '')}" /></label>
        <label>Last name<input required name="lastName" value="${escapeHtml(values.lastName || '')}" /></label>
        <label>Designation<input required name="designation" value="${escapeHtml(values.designation || '')}" /></label>
        <button type="submit">Generate & Download Card Image</button>
      </form>
    </section>`;

  return renderPage({ title: 'Virtual Visiting Card Generator', content });
}

async function generateCardSvg(card, cardUrl) {
  const qrDataUrl = await QRCode.toDataURL(cardUrl, { margin: 1, width: 320 });
  const fullName = `${escapeHtml(card.firstName)} ${escapeHtml(card.lastName)}`;
  const designation = escapeHtml(card.designation);
  const escapedId = escapeHtml(card.id);
  const escapedUrl = escapeHtml(cardUrl);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1050" height="600" viewBox="0 0 1050 600" role="img" aria-label="Virtual visiting card">
  <defs>
    <linearGradient id="hero" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#F37021"/>
      <stop offset="100%" stop-color="#942864"/>
    </linearGradient>
  </defs>
  <rect width="1050" height="600" rx="36" fill="#ffffff"/>
  <rect x="24" y="24" width="1002" height="552" rx="28" fill="#ffffff" stroke="#DADAD9" stroke-width="2"/>
  <rect x="24" y="24" width="1002" height="132" rx="28" fill="url(#hero)"/>
  <rect x="24" y="130" width="1002" height="26" fill="#D2401A"/>

  <text x="74" y="88" fill="#FBD644" font-family="Arial, sans-serif" font-size="30" font-weight="700">ACME CO</text>
  <text x="74" y="126" fill="#ffffff" font-family="Arial, sans-serif" font-size="46" font-weight="700">Virtual Visiting Card</text>

  <rect x="744" y="168" width="220" height="220" rx="20" fill="#ffffff" stroke="#DADAD9" stroke-width="2"/>
  <image href="${qrDataUrl}" x="764" y="188" width="180" height="180"/>
  <text x="854" y="418" text-anchor="middle" fill="#6D6D71" font-family="Arial, sans-serif" font-size="20">Scan to open card</text>

  <text x="74" y="258" fill="#3B475B" font-family="Arial, sans-serif" font-size="64" font-weight="700">${fullName}</text>
  <text x="74" y="312" fill="#6D6D71" font-family="Arial, sans-serif" font-size="34">${designation}</text>

  <text x="74" y="386" fill="#942864" font-family="Arial, sans-serif" font-size="18" font-weight="700">CARD ID</text>
  <text x="74" y="420" fill="#D2401A" font-family="Arial, sans-serif" font-size="25" font-weight="700">${escapedId}</text>

  <rect x="74" y="472" width="640" height="56" rx="14" fill="#FDE7DD"/>
  <text x="92" y="507" fill="#6D6D71" font-family="Arial, sans-serif" font-size="19">${escapedUrl}</text>
</svg>`;
}

function generateVcard(card, cardUrl) {
  const fullName = `${card.firstName} ${card.lastName}`;
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${fullName}`,
    `N:${card.lastName};${card.firstName};;;`,
    `TITLE:${card.designation}`,
    `NOTE:Virtual Card ID ${card.id}`,
    `URL:${cardUrl}`,
    'ORG:Acme Co',
    'END:VCARD'
  ].join('\r\n');
}

function getCardOr404(req, res) {
  const card = cards.get(req.params.id);
  if (!card) {
    res.status(404).send(
      renderPage({
        title: 'Card Not Found',
        content: `<section class="glass-panel"><h1>404 - Card not found</h1><p>We couldn't find a visiting card for ID <strong>${escapeHtml(req.params.id)}</strong>.</p><a href="/">Create a new card</a></section>`
      })
    );
    return null;
  }
  return card;
}

app.get('/', (req, res) => {
  res.send(renderFormPage());
});

app.post('/create', async (req, res, next) => {
  try {
    const { firstName, lastName, designation, errors } = validateCardFields(req.body);

    if (errors.length) {
      res.status(400).send(renderFormPage(errors, { firstName, lastName, designation }));
      return;
    }

    const id = crypto.randomUUID();
    const card = { id, firstName, lastName, designation, createdAt: new Date().toISOString() };
    cards.set(id, card);

    const cardUrl = `${getBaseUrl(req)}/card/${id}`;
    const svg = await generateCardSvg(card, cardUrl);

    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="visiting-card-${id}.svg"`);
    res.setHeader('X-Card-Url', cardUrl);
    res.send(svg);
  } catch (error) {
    next(error);
  }
});

app.get('/card/:id', (req, res) => {
  const card = getCardOr404(req, res);
  if (!card) return;

  const content = `<section class="glass-panel visiting-preview">
    <span class="chip">Digital Card Preview</span>
    <h1>${escapeHtml(card.firstName)} ${escapeHtml(card.lastName)}</h1>
    <p class="designation">${escapeHtml(card.designation)}</p>
    <div class="meta-row"><span>Card ID</span><strong>${escapeHtml(card.id)}</strong></div>
    <img src="/card/${card.id}/qr.png" alt="QR code for ${escapeHtml(card.firstName)} ${escapeHtml(card.lastName)}" class="qr" />
    <div class="actions">
      <a class="button" href="/card/${card.id}/download" download="visiting-card-${card.id}.svg">Download Card Image</a>
      <a class="button secondary" href="/card/${card.id}/contact.vcf" download="visiting-card-${card.id}.vcf">Download vCard</a>
    </div>
    <p class="download-note">You can share the SVG card image and import the vCard directly into contacts.</p>
    <a class="link-muted" href="/">Create another card</a>
  </section>`;

  res.send(renderPage({ title: `${card.firstName} ${card.lastName} - Visiting Card`, content }));
});

app.get('/card/:id/qr.png', async (req, res, next) => {
  try {
    const card = getCardOr404(req, res);
    if (!card) return;

    const cardUrl = `${getBaseUrl(req)}/card/${card.id}`;
    const qr = await QRCode.toBuffer(cardUrl, { type: 'png', margin: 1, width: 300 });

    res.type('png').send(qr);
  } catch (error) {
    next(error);
  }
});

app.get('/card/:id/download', async (req, res, next) => {
  try {
    const card = getCardOr404(req, res);
    if (!card) return;

    const cardUrl = `${getBaseUrl(req)}/card/${card.id}`;
    const svg = await generateCardSvg(card, cardUrl);

    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="visiting-card-${card.id}.svg"`);
    res.send(svg);
  } catch (error) {
    next(error);
  }
});

app.get('/card/:id/contact.vcf', (req, res) => {
  const card = getCardOr404(req, res);
  if (!card) return;

  const cardUrl = `${getBaseUrl(req)}/card/${card.id}`;
  const vcard = generateVcard(card, cardUrl);

  res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="visiting-card-${card.id}.vcf"`);
  res.send(vcard);
});

app.use((req, res) => {
  res.status(404).send(
    renderPage({
      title: 'Page Not Found',
      content: '<section class="glass-panel"><h1>404 - Page not found</h1><p>The page you requested does not exist.</p><a href="/">Go to home</a></section>'
    })
  );
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).send(
    renderPage({
      title: 'Server Error',
      content: '<section class="glass-panel"><h1>Something went wrong</h1><p>Please try again in a moment.</p><a href="/">Go back</a></section>'
    })
  );
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Virtual Visiting Card Generator running on port ${PORT}`);
  });
}

module.exports = { app, cards, validateCardFields, generateCardSvg, generateVcard };
