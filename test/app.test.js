const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app, cards } = require('../server');

test.beforeEach(() => {
  cards.clear();
});

test('GET / returns landing form', async () => {
  const res = await request(app).get('/');
  assert.equal(res.status, 200);
  assert.match(res.text, /Virtual Visiting Card Generator/);
});

test('POST /create validates required fields', async () => {
  const res = await request(app).post('/create').send('firstName=&lastName=&designation=').set('Content-Type', 'application/x-www-form-urlencoded');
  assert.equal(res.status, 400);
  assert.match(res.text, /First name is required/);
});

test('POST /create returns downloadable card SVG and card URL header', async () => {
  const res = await request(app)
    .post('/create')
    .send('firstName=Anu&lastName=Raj&designation=Engineer')
    .set('Content-Type', 'application/x-www-form-urlencoded');

  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /image\/svg\+xml/);
  assert.ok(res.headers['x-card-url']);
  assert.match(res.body.toString('utf8'), /<svg/);
});

test('Card routes support display, qr, card image download, and vcard', async () => {
  const createRes = await request(app)
    .post('/create')
    .send('firstName=Arun&lastName=K&designation=Designer')
    .set('Content-Type', 'application/x-www-form-urlencoded');

  const cardUrl = createRes.headers['x-card-url'];
  const id = cardUrl.split('/').pop();

  const pageRes = await request(app).get(`/card/${id}`);
  assert.equal(pageRes.status, 200);
  assert.match(pageRes.text, /Arun K/);

  const qrRes = await request(app).get(`/card/${id}/qr.png`);
  assert.equal(qrRes.status, 200);
  assert.equal(qrRes.headers['content-type'], 'image/png');

  const downloadRes = await request(app).get(`/card/${id}/download`);
  assert.equal(downloadRes.status, 200);
  assert.match(downloadRes.headers['content-type'], /image\/svg\+xml/);

  const vcfRes = await request(app).get(`/card/${id}/contact.vcf`);
  assert.equal(vcfRes.status, 200);
  assert.match(vcfRes.headers['content-type'], /text\/vcard/);
  assert.match(vcfRes.text, /BEGIN:VCARD/);
});

test('Missing IDs return 404', async () => {
  const res = await request(app).get('/card/missing-id');
  assert.equal(res.status, 404);
  assert.match(res.text, /Card not found/);
});
