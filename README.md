# Wikipedia Featured Articles JSON Mirror

Generates and publishes compact JSON snapshots of Wikipedia’s Featured Article of the Day (TFA) for multiple languages, updated every 6 hours and served via GitHub Pages.

## Overview

- Data source: `tfa` from `https://api.wikimedia.org/feed/v1/wikipedia/{language}/featured/{yyyy}/{mm}/{dd}`
- Time basis: “Today” is computed in UTC+12. If `tfa` is unavailable for that date, the script walks backwards day-by-day until an available `tfa` is found (up to 60 days).
- Update cadence: Every 6 hours via GitHub Actions.
- Output: One JSON per language in `dist/`, published to GitHub Pages.

## Supported Languages

`bn, de, el, en, he, hu, ja, sd, sv, ur, vi, zh`

Based on [Wikimedia API Language Support](https://api.wikimedia.org/wiki/Feed_API/Language_support).

Each language is published as `/<repo>/{lang}.json` once deployed.

## JSON Schema

Each file contains the following fields:

- `timestamp`: ISO timestamp string of the date retrieved
- `title`: Fallback in this order: `tfa.titles.display` → `tfa.titles.normalized` → `tfa.title`
- `description`: From `tfa.description` (or `null`)
- `extract`: From `tfa.extract` (or `null`)
- `extract_html`: From `tfa.extract_html` (or `null`)

If no `tfa` can be found within the lookback window, a JSON with all fields `null` is emitted for that language.

## Live URLs (after first deployment)

- Index: `https://blueset.github.io/wikipedia-featured/`
- Language JSON: `https://blueset.github.io/wikipedia-featured/<lang>.json` (e.g., `/en.json`, `/de.json`)

The index page lists links to all supported language files.

## Local Development

Requirements: Node.js 20+

```
npm install
npm run build
```

- Outputs to `dist/`:
  - `dist/index.html`
  - `dist/<lang>.json` for each language

## Extending

- Add languages: Edit `LANGUAGES` in `scripts/fetch.js`.
- Change schedule: Update the cron in `.github/workflows/fetch-and-deploy.yml`.
- Output shape: Adjust field selection/ordering in `scripts/fetch.js`.

## Disclaimer

This project consumes the Wikimedia API. Respect their terms of use and rate limits. Data and availability depend on the upstream API.
