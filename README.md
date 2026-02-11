# Virtual Visiting Card Generator

Production-ready Node.js + Express application that creates visitor visiting cards as PDFs with embedded QR codes.

## Features

- Mobile-first form on `/` with required fields:
  - First name
  - Last name
  - Designation
- `POST /create`
  - validates inputs
  - creates unique card ID
  - stores card in memory
  - returns immediate downloadable PDF
- Public card page: `/card/:id`
  - full name
  - designation
  - card ID
  - QR image
  - Download PDF button
- QR endpoint: `/card/:id/qr.png`
- Download endpoint: `/card/:id/download`
- Friendly 404 pages for invalid card IDs and unknown routes
- Basic tests for form validation, route behavior, PDF and QR generation

## Tech stack

- Node.js (18+)
- Express
- PDFKit
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

1. Push this project to a GitHub repository.
2. In Render, create a **Blueprint** deployment (or Web Service) using this repository.
3. Render will read `render.yaml`:
   - `env: node`
   - `buildCommand: npm install`
   - `startCommand: npm start`
4. Deploy and open your public Render URL.
5. Generated QR codes automatically point to your hosted card URL.

## Persistence behavior

This app currently stores cards in **in-memory storage** (`Map`).

- Server restarts/redeploys will clear all cards.
- Old `/card/:id` links will return 404 after restart.

For permanent storage, switch to SQLite/Postgres.
