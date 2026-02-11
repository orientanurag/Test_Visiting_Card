# Virtual Visiting Card Generator

Production-ready Node.js + Express app that generates:

- a shareable **SVG visiting card image**
- a downloadable **vCard (.vcf)** contact file
- QR code links back to the hosted public card page

## Features

- Mobile-first form on `/` with required fields:
  - First name
  - Last name
  - Designation
- `POST /create`
  - validates inputs
  - creates unique card ID
  - stores card in memory
  - returns immediate downloadable SVG card image
- Public card page: `/card/:id`
  - full name
  - designation
  - card ID
  - QR image
  - Download Card Image button
  - Download vCard button
- QR endpoint: `/card/:id/qr.png`
- Card image endpoint: `/card/:id/download`
- vCard endpoint: `/card/:id/contact.vcf`
- Friendly 404 pages for invalid card IDs and unknown routes
- Basic tests for form validation and route behavior

## Tech stack

- Node.js (18+)
- Express
- qrcode
- supertest + node:test

## Local run

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the app:

   ```bash
   npm start
   ```

3. Open:

   ```
   http://localhost:3000
   ```

4. Run tests:

   ```bash
   npm test
   ```

## Render deployment

1. Push this repository to GitHub.
2. In Render, create a **Blueprint** deployment (or Web Service) from this repository.
3. Render reads `render.yaml`:
   - `env: node`
   - `buildCommand: npm install`
   - `startCommand: npm start`
4. Click **Manual Deploy → Deploy latest commit** after every new push.

### Verify on Render

After deployment, verify these paths from your Render domain:

- `/` should show the form.
- submit form and confirm response downloads `.svg`.
- open `/card/:id` and verify both buttons:
  - `Download Card Image` → `.svg`
  - `Download vCard` → `.vcf`
- `/card/:id/contact.vcf` should return vCard text beginning with `BEGIN:VCARD`.

## Why Render may still show old UI

Most common reasons:

- latest commit is not pushed to GitHub
- Render service is connected to a different branch
- deploy did not run after merge
- browser cache (hard refresh needed)

## Persistence behavior

This app currently stores cards in **in-memory storage** (`Map`).

- Server restarts/redeploys will clear all cards.
- Old `/card/:id` links will return 404 after restart.

For permanent storage, switch to SQLite/Postgres.

## Merge-conflict prevention workflow

To avoid recurring conflicts in `server.js` and `public/styles.css`:

1. Always pull/rebase before starting:

   ```bash
   git checkout work
   git pull --rebase origin work
   ```

2. Keep these files as single-source-of-truth (avoid parallel edits in multiple branches).
3. Before push, run:

   ```bash
   npm test
   ```

4. If conflict appears, prefer current canonical versions of:
   - `server.js`
   - `public/styles.css`
