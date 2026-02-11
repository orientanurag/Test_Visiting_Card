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
  const qrBuffer = await QRCode.toBuffer(cardUrl, { type: 'png', margin: 1, width: 280 });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [420, 250], margin: 18 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const frameX = 12;
    const frameY = 12;
    const frameWidth = pageWidth - 24;
    const frameHeight = pageHeight - 24;
    const left = frameX + 20;
    const top = frameY + 18;
    const qrSize = 102;
    const qrX = frameX + frameWidth - qrSize - 18;
    const qrY = top + 8;

    doc.roundedRect(frameX, frameY, frameWidth, frameHeight, 16).fillAndStroke('#ffffff', '#DADAD9');
    doc.roundedRect(frameX, frameY, frameWidth, 64, 16).fill('#F37021');
    doc.roundedRect(frameX, frameY + 54, frameWidth, 10, 0).fill('#D2401A');

    doc.fillColor('#FBD644').fontSize(9).font('Helvetica-Bold').text('ACME CO', left, top + 4, { width: 180 });
    doc.fillColor('#ffffff').fontSize(16).font('Helvetica-Bold').text('Virtual Visiting Card', left, top + 18, { width: 220 });

    doc.roundedRect(qrX - 7, qrY - 7, qrSize + 14, qrSize + 14, 10).fill('#ffffff');
    doc.roundedRect(qrX - 7, qrY - 7, qrSize + 14, qrSize + 14, 10).lineWidth(1).strokeColor('#DADAD9').stroke();
    doc.image(qrBuffer, qrX, qrY, { fit: [qrSize, qrSize] });

    const fullName = `${card.firstName} ${card.lastName}`;
    const detailTop = frameY + 90;
    const detailWidth = frameWidth - qrSize - 54;
    doc.fillColor('#3B475B').fontSize(21).font('Helvetica-Bold').text(fullName, left, detailTop, { width: detailWidth, lineGap: -2 });
    doc.fillColor('#6D6D71').fontSize(12).font('Helvetica').text(card.designation, left, detailTop + 30, { width: detailWidth });

    doc.fillColor('#942864').fontSize(8.5).font('Helvetica-Bold').text('CARD ID', left, detailTop + 64);
    doc.fillColor('#D2401A').fontSize(10.5).font('Helvetica-Bold').text(card.id, left, detailTop + 76, { width: frameWidth - 40 });

    doc.fillColor('#6D6D71').fontSize(8).font('Helvetica').text('Scan QR to open hosted digital card', qrX - 10, qrY + qrSize + 10, { width: qrSize + 20, align: 'center' });

    doc.roundedRect(left, pageHeight - 42, frameWidth - 40, 22, 8).fill('#FDE7DD');
    doc.fillColor('#6D6D71').fontSize(8).font('Helvetica').text(cardUrl, left + 8, pageHeight - 35, { width: frameWidth - 58, ellipsis: true });

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
    <div class="actions">
      <a class="button" href="/card/${card.id}/download" download="visiting-card-${card.id}.pdf">Download PDF</a>
      <a class="button secondary" href="/card/${card.id}/download" target="_blank" rel="noopener">Open PDF</a>
    </div>
    <p class="download-note">Tip: If your browser previews PDF first, use the share/download option there to save to your phone.</p>
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
