import { getUTCPlus12Now, addDaysUTC, formatYMD } from './utils.js';
import { writeFile } from "fs/promises";

export const LANGUAGES = [
  'bn', 'de', 'el', 'en', 'he', 'hu', 'ja', 'sd', 'sv', 'ur', 'vi', 'zh'
];

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

export function pickTitle(tfa) {
  return (
    tfa?.titles?.display ||
    tfa?.titles?.normalized ||
    tfa?.title || null
  );
}

export async function getLatestAvailableTfa(lang, baseDate, maxLookbackDays = 60) {
  let err;
  for (let i = 0; i <= maxLookbackDays; i++) {
    const tryDate = addDaysUTC(baseDate, -i);
    try {
      const data = await fetchFeatured(lang, tryDate);
      if (data && data.tfa) {
        return { tfa: data.tfa, usedDate: tryDate };
      }
    } catch (e) {
      err = e;
    }
  }
  throw new Error(`No TFA found for ${lang} within ${maxLookbackDays} days. Last error: ${err?.message || 'n/a'}`);
}

export async function tfa() {
  console.log(`Fetching TFA for ${LANGUAGES.length} languages...`);
  const base = getUTCPlus12Now();
  for (const lang of LANGUAGES) {
    try {
      const { tfa, usedDate } = await getLatestAvailableTfa(lang, base);
      const out = {
        timestamp: usedDate.toISOString(),
        title: pickTitle(tfa),
        description: tfa.description ?? null,
        extract: tfa.extract ?? null,
        extract_html: tfa.extract_html ?? null,
      };

      await writeFile(
        `dist/${lang}.json`,
        JSON.stringify(out, null, 2),
        "utf8"
      );
      console.log(
        `Wrote ${lang}.json (date used: ${formatYMD(usedDate).y}-${
          formatYMD(usedDate).m
        }-${formatYMD(usedDate).d})`
      );
    } catch (e) {
      console.error(`Failed ${lang}: ${e.message}`);
      const out = {
        timestamp: null,
        title: null,
        description: null,
        extract: null,
        extract_html: null,
      };
      await writeFile(
        `dist/${lang}.json`,
        JSON.stringify(out, null, 2),
        "utf8"
      );
    }
  }
}