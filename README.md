# Pocket Ledger

A tiny offline-first money tracker that runs as an installable web app (PWA). It has no account, no network calls and no tracking. Your data stays in the browser's IndexedDB on your phone until you export it.

- Log an expense by tapping +, typing the amount, then tapping a category.
- The monthly view shows what you spent, your income, your net total and a breakdown by category.
- When a month ends with money left over (or a shortfall), the next month offers a one-tap carry-over. The carried amount stays correct if you edit the old month later, and tapping it lets you remove it.
- You can save a JSON backup and restore it, or export a CSV spreadsheet.
- It works in Sinhala or English. It follows the phone's language, and you can switch in Settings.
- The whole app is about 14 KB gzipped and works fully offline after the first visit.

## Develop

```sh
npm install
npm run dev        # local dev server
npm test           # unit tests (Vitest)
npm run build      # type-check and build to dist/
npm run test:e2e   # builds must exist; offline end-to-end test in headless Chromium
```

The e2e test looks for Chromium under `/opt/pw-browsers`. Set `CHROME_PATH` to use another browser.

## Deploy

Every push to `main` runs the tests and publishes the app to GitHub Pages at https://disura-randunu.github.io/pocket-ledger/ (see `.github/workflows/deploy.yml`). In the repo settings, Pages must be set to deploy from "GitHub Actions". `dist/` is plain static files, so any other static host works too. Then open the URL on your phone and choose "Add to Home Screen". The app asks the browser for persistent storage the first time you save, and it reminds you to make a backup every 30 days.

## Layout

- `src/money.ts`: the data model, money parsing and formatting, monthly summaries, CSV export and backup validation
- `src/db.ts`: storage in IndexedDB, through the `idb` library
- `src/App.tsx`: the whole UI (home screen, entry sheet, settings)
- `src/sw-template.js`: the service worker. At build time the precache file list is injected by `vite.config.ts`.
