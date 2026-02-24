# Project Saya VNDB Companion

Web client for browsing VNDB, viewing detailed VN pages, and managing a personal VN list with API token auth.

## Tech Stack

- React + TypeScript
- Vite
- Vite PWA plugin
- VNDB API v2 (Kana)

## Core Features

- Search and infinite-scroll VN list browsing
- Detailed VN view:
  - full cover image
  - release + rating
  - formatted description rendering
  - related titles with navigation
  - developer chips with search navigation
  - tags with spoiler/category filtering
  - screenshots gallery + lightbox viewer
- VNDB token onboarding/login (with skip option)
- Personal VN list support:
  - load user list
  - add VN to list
  - update label/status (playing, finished, stalled, dropped, wishlist, blacklist)
  - remove from list
- Persistent filter/sort settings
- Theming system (multiple color themes)
- Responsive layouts tuned for:
  - desktop landscape
  - mobile portrait
  - mobile landscape

## VNDB Token Permissions

For full functionality, the token should include:

- `listread`
- `listwrite`

Without these, personal-list features are limited.

## Local Development

Install dependencies:

```bash
npm install
```

Run dev server:

```bash
npm run dev
```

Build:

```bash
npm run build
```

## Local HTTPS (mkcert)

This project supports local HTTPS automatically when mkcert files exist in the project root.

Generate certs:

```bash
brew install mkcert nss
mkcert -install
cd /Users/byntobox/vndb-client
mkcert localhost 127.0.0.1 ::1
```

Then run:

```bash
npm run dev
```

Vite will serve HTTPS if it finds:

- `localhost+N.pem`
- `localhost+N-key.pem`

These files are ignored by git.

## Branding and App Icons

Icon asset paths are now centralized in `public/icons/`.

Replace these files with your logo assets:

- `public/icons/favicon.svg`
- `public/icons/favicon-32x32.png`
- `public/icons/apple-touch-icon.png`
- `public/icons/pwa-192x192.png`
- `public/icons/pwa-512x512.png`

References are already wired in:

- `index.html` (tab icon + Apple touch icon)
- `vite.config.ts` PWA manifest icons

## API Notes

- In development, API requests use Vite proxy path `/api/vndb` (configured in `vite.config.ts`) to avoid browser CORS issues on write endpoints.
- In production, requests go directly to `https://api.vndb.org/kana`.

If production CORS issues appear for authenticated writes, add a backend proxy (Lambda/API Gateway, etc.) and route production API calls through it.

## Deployment (AWS Recommended Path)

Recommended: AWS Amplify Hosting for this frontend.

Basic flow:

1. Connect GitHub repo to Amplify
2. Use build command: `npm run build`
3. Publish directory: `dist`
4. Deploy branch (e.g., `main`)

## Repository

- GitHub: https://github.com/byntobox/project-saya-vndb-companion
