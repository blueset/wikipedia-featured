// Fetch Wikipedia Featured Article of the Day (TFA) for multiple languages
// and output compact JSON files for GitHub Pages.

import { mkdir, writeFile } from 'fs/promises';

const LANGUAGES = [
  'bn', 'de', 'el', 'en', 'he', 'hu', 'ja', 'sd', 'sv', 'ur', 'vi', 'zh'
];

// Compute today's date in UTC+12, then step backwards if needed
function getUTCPlus12Now() {
  const now = new Date();
  return new Date(now.getTime() + 12 * 60 * 60 * 1000);
}

function addDaysUTC(date, deltaDays) {
  return new Date(date.getTime() + deltaDays * 24 * 60 * 60 * 1000);
}

function formatYMD(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return { y, m, d };
}

async function fetchFeatured(lang, date) {
  const { y, m, d } = formatYMD(date);
  const url = `https://api.wikimedia.org/feed/v1/wikipedia/${lang}/featured/${y}/${m}/${d}`;
  const res = await fetch(url, {
    headers: {
      'accept': 'application/json; charset=utf-8',
      // Wikimedia requests a descriptive UA. Adjust if you fork.
      'user-agent': 'wikipedia-featured-json/1.0 (GitHub Actions)' 
    }
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${lang} ${y}-${m}-${d}`);
  }
  return res.json();
}

function pickTitle(tfa) {
  // Fallback: titles.display → titles.normalized → title
  return (
    tfa?.titles?.display ||
    tfa?.titles?.normalized ||
    tfa?.title || null
  );
}

async function getLatestAvailableTfa(lang, baseDate, maxLookbackDays = 60) {
  let err;
  for (let i = 0; i <= maxLookbackDays; i++) {
    const tryDate = addDaysUTC(baseDate, -i);
    try {
      const data = await fetchFeatured(lang, tryDate);
      if (data && data.tfa) {
        return { tfa: data.tfa, usedDate: tryDate };
      }
    } catch (e) {
      // Keep last error; continue lookback
      err = e;
    }
  }
  throw new Error(`No TFA found for ${lang} within ${maxLookbackDays} days. Last error: ${err?.message || 'n/a'}`);
}

async function main() {
  const base = getUTCPlus12Now();
  await mkdir('dist', { recursive: true });

  for (const lang of LANGUAGES) {
    try {
      const { tfa, usedDate } = await getLatestAvailableTfa(lang, base);
      const out = {
        // extract, extract_html directly from tfa
        timestamp: usedDate.toISOString(),
        title: pickTitle(tfa),
        description: tfa.description ?? null,
        extract: tfa.extract ?? null,
        extract_html: tfa.extract_html ?? null
      };

      await writeFile(`dist/${lang}.json`, JSON.stringify(out, null, 2), 'utf8');
      console.log(`Wrote ${lang}.json (date used: ${formatYMD(usedDate).y}-${formatYMD(usedDate).m}-${formatYMD(usedDate).d})`);
    } catch (e) {
      console.error(`Failed ${lang}: ${e.message}`);
      const out = {
        timestamp: null,
        title: null,
        description: null,
        extract: null,
        extract_html: null
      };
      await writeFile(`dist/${lang}.json`, JSON.stringify(out, null, 2), 'utf8');
    }
  }

  // Generate a simple index.html with links to each language JSON
  const updatedAt = new Date().toISOString();
  const listItems = LANGUAGES.map(l => `<li><a href="${l}.json">${l}.json</a></li>`).join('\n');
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Wikipedia Featured Articles JSON</title>
    <style>
      body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;margin:2rem;line-height:1.5;color:#1b1f23}
      h1{font-size:1.5rem;margin-bottom:.5rem}
      .meta{color:#586069;font-size:.9rem;margin-bottom:1rem}
      ul{padding-left:1.2rem}
      code{background:#f6f8fa;padding:.1rem .25rem;border-radius:3px}
    </style>
  </head>
  <body>
    <h1>Wikipedia Featured Articles (TFA) Mirror</h1>
    <p class="meta">Updated: <time datetime="${updatedAt}">${updatedAt}</time> • Interval: every 6 hours • Timezone base: UTC+12</p>
    <p>Each link returns a JSON document with fields <code>timestamp</code>, <code>title</code>, <code>description</code>, <code>extract</code>, <code>extract_html</code>.</p>
    <ul>
      ${listItems}
    </ul>
    <p>Source: Wikimedia Featured API (<code>/feed/v1/wikipedia/{lang}/featured/{yyyy}/{mm}/{dd}</code>, field <code>tfa</code>). Title fallback: <code>titles.display</code> → <code>titles.normalized</code> → <code>title</code>. If missing, we backfill to the most recent available day.</p>
  </body>
</html>`;
  await writeFile('dist/index.html', html, 'utf8');
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
