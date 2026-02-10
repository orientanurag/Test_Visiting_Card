const crypto = require('crypto');
const path = require('path');
const express = require('express');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');

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
      <p>Create a clean, modern visiting card and instantly download a print-ready PDF with a smart QR code.</p>
      ${errorHtml}
      <form method="post" action="/create" novalidate class="form-grid">
        <label>First name<input required name="firstName" value="${escapeHtml(values.firstName || '')}" /></label>
        <label>Last name<input required name="lastName" value="${escapeHtml(values.lastName || '')}" /></label>
        <label>Designation<input required name="designation" value="${escapeHtml(values.designation || '')}" /></label>
        <button type="submit">Generate & Download PDF</button>
      </form>
    </section>`;

  return renderPage({ title: 'Virtual Visiting Card Generator', content });
}

async function generatePdf(card, cardUrl) {
  const qrBuffer = await QRCode.toBuffer(cardUrl, { type: 'png', margin: 1, width: 240 });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A6', margin: 24 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const frameX = 16;
    const frameY = 16;
    const frameWidth = pageWidth - 32;
    const frameHeight = pageHeight - 32;
    const left = frameX + 18;
    const top = frameY + 18;
    const qrSize = 84;
    const qrX = frameX + frameWidth - qrSize - 18;
    const qrY = top;

    doc.roundedRect(frameX, frameY, frameWidth, frameHeight, 14).fillAndStroke('#f8fafc', '#dbeafe');
    doc.roundedRect(frameX, frameY, frameWidth, 52, 14).fill('#1d4ed8');

    doc.fillColor('#bfdbfe').fontSize(9).text('ACME CO', left, top + 6, { width: 140 });
    doc.fillColor('#ffffff').fontSize(15).font('Helvetica-Bold').text('Virtual Visiting Card', left, top + 18, { width: 170 });

    doc.roundedRect(qrX - 5, qrY - 5, qrSize + 10, qrSize + 10, 8).fill('#ffffff');
    doc.image(qrBuffer, qrX, qrY, { fit: [qrSize, qrSize] });

    const fullName = `${card.firstName} ${card.lastName}`;
    const detailTop = frameY + 82;
    doc.fillColor('#0f172a').fontSize(18).font('Helvetica-Bold').text(fullName, left, detailTop, { width: frameWidth - qrSize - 44 });
    doc.fillColor('#334155').fontSize(11).font('Helvetica').text(card.designation, left, detailTop + 24, { width: frameWidth - qrSize - 44 });

    doc.fillColor('#475569').fontSize(8).text('CARD ID', left, detailTop + 56);
    doc.fillColor('#111827').fontSize(10).font('Helvetica-Bold').text(card.id, left, detailTop + 66, { width: frameWidth - 36 });

    doc.moveTo(left, pageHeight - 48).lineTo(frameX + frameWidth - 18, pageHeight - 48).lineWidth(1).strokeColor('#e2e8f0').stroke();
    doc.fillColor('#64748b').fontSize(8).font('Helvetica').text(cardUrl, left, pageHeight - 40, { width: frameWidth - 36 });

    doc.end();
  });
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
    const pdf = await generatePdf(card, cardUrl);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="visiting-card-${id}.pdf"`);
    res.setHeader('X-Card-Url', cardUrl);
    res.send(pdf);
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
    <a class="button" href="/card/${card.id}/download">Download PDF</a>
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
    const pdf = await generatePdf(card, cardUrl);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="visiting-card-${card.id}.pdf"`);
    res.send(pdf);
  } catch (error) {
    next(error);
  }
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

module.exports = { app, cards, validateCardFields, generatePdf };
