import { writeFile } from "fs/promises";
import * as cheerio from "cheerio";
import {
  processDescriptions,
  enParseDate,
  getFirstDayOfWeek,
  filterEmptyStrings,
} from "./utils.js";

const SOURCES = [
  {
    id: "en_wotd",
    lang: "en",
    type: "wotd",
    url: "https://en.wiktionary.org/w/api.php?action=parse&page=Template:Word_of_the_day&prop=text&formatversion=2&format=json",
  },
  {
    id: "en_fwotd",
    lang: "en",
    type: "fwotd",
    url: "https://en.wiktionary.org/w/api.php?action=parse&page=Template:Foreign_Word_of_the_Day&prop=text&formatversion=2&format=json",
  },
  {
    id: "ja_wotw",
    lang: "ja",
    type: "wotw",
    url: "https://ja.wiktionary.org/w/api.php?action=parse&page=Template:Word_of_the_week&prop=text&formatversion=2&format=json",
  },
  {
    id: "zh_wotd",
    lang: "zh",
    type: "wotd",
    url: "https://zh.wiktionary.org/w/api.php?action=parse&page=Template:%E6%AF%8F%E6%97%A5%E4%B8%80%E8%A9%9E&prop=text&formatversion=2&format=json",
  },
  {
    id: "zh_fwotd",
    lang: "zh",
    type: "fwotd",
    url: "https://zh.wiktionary.org/w/api.php?action=parse&page=Template:%E5%A4%96%E8%AA%9E%E6%AF%8F%E6%97%A5%E4%B8%80%E8%A9%9E&prop=text&formatversion=2&format=json",
  },
];

async function fetchWotD(url) {
  const res = await fetch(url, {
    headers: {
      accept: "application/json; charset=utf-8",
      // Wikimedia requests a descriptive UA. Adjust if you fork.
      "user-agent": "wikipedia-featured-json/1.0 (GitHub Actions)",
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  const json = await res.json();
  return json.parse.text;
}

function parseEnWotd($) {
  // word: `#WOTD-rss-title` → innerText
  const word = $("#WOTD-rss-title").text() || "";

  // partOfSpeech: `b:has(#WOTD-rss-title) + i` → innerText
  const partOfSpeech = $("b:has(#WOTD-rss-title) + i").text() || "";

  // descriptions[]: `#WOTD-rss-description > ol > li` → innerHTML → processDescriptions
  const descriptions = [];
  $("#WOTD-rss-description > ol > li").each((i, li) => {
    descriptions.push(processDescriptions($(li), $));
  });

  // date: `a` that has content `"view"` → parse its href to match `\/(\d+)\/(\w+)_(\d+)$` → enParseDate
  let date = "";
  const viewLink = $("a")
    .filter((i, el) => $(el).text().trim() === "view")
    .first();
  if (viewLink.length) {
    const href = viewLink.attr("href") || "";
    const match = href.match(/\/(\d+)\/(\w+)_(\d+)$/);
    if (match) {
      date = enParseDate(match[1], match[2], match[3]);
    }
  }

  return {
    word,
    partOfSpeech,
    descriptions: filterEmptyStrings(descriptions),
    date,
  };
}

function parseEnFwotd($) {
  // lang: `#FWOTD-rss-language > a` → innerText
  const language = $("#FWOTD-rss-language > a").text() || "";

  // word: `.headword-line a` → innerText
  const word = $(".headword-line a").text() || "";

  // partOfSpeech: `.headword-line + i` → innerText
  const partOfSpeech = $(".headword-line").next("i").text() || "";

  // descriptions[]: `#FWOTD-rss-description > ol > li` → innerHTML → processDescriptions
  const descriptions = [];
  $("#FWOTD-rss-description > ol > li").each((i, li) => {
    descriptions.push(processDescriptions($(li), $));
  });

  // date: html content to match `\/(\d+)\/(\w+)_(\d+)\n` → enParseDate
  let date = "";
  const html = $.html();
  const match = html.match(/\/(\d+)\/(\w+)_(\d+)\n/);
  if (match) {
    date = enParseDate(match[1], match[2], match[3]);
  }

  return {
    lang: language,
    word,
    partOfSpeech,
    descriptions: filterEmptyStrings(descriptions),
    date,
  };
}

function parseJaWotw($) {
  // word: `b > .Jpan > a` → innerHTML
  const word = $("b > .Jpan > a").html() || "";

  // partOfSpeech: `*:has(> b > .Jpan > a) > i` → innerText
  const partOfSpeech = $("*:has(> b > .Jpan > a) > i").text() || "";

  // definitions: `ol > li` and `dl > dd > dl > dd > i` → processDescriptions in DOM order
  const definitions = [];
  $("ol > li, dl > dd > dl > dd > i").each((i, el) => {
    definitions.push(processDescriptions($(el), $));
  });

  // date: html match `/今週の言葉\/一覧\/(\d+)\n\/` → use match[1] as week number
  let date = "";
  const html = $.html();
  const match = html.match(/今週の言葉\/一覧\/(\d+)/);
  if (match) {
    const weekNumber = parseInt(match[1], 10);
    if (!isNaN(weekNumber)) {
      date = getFirstDayOfWeek(weekNumber);
    }
  }

  return {
    word,
    partOfSpeech,
    definitions: filterEmptyStrings(definitions),
    date,
  };
}

function parseZhWotd($) {
  // word: `.mf-wotd > div:first-child > b` → processDescriptions → innerHTML
  const wordElement = $(".mf-wotd > div:first-child > b");
  const word = wordElement.length ? processDescriptions(wordElement, $) : "";

  // partOfSpeech: `.mf-wotd > div:first-child` removing its `> b` children → innerText
  const mfWotdElement = $(".mf-wotd > div:first-child").clone();
  mfWotdElement.find("b").remove();
  const partOfSpeech = mfWotdElement.text().trim() || "";

  // definitions: `#WOTD-rss-description > ol > li, #WOTD-rss-description > p` → remove `> b` children → processDescriptions
  const definitions = [];
  $("#WOTD-rss-description > ol > li, #WOTD-rss-description > p").each(
    (i, el) => {
      const element = $(el).clone();
      element.find("> b").remove();
      definitions.push(processDescriptions(element, $));
    }
  );

  // date: `a` has content `"檢視"` → match href with `/\/(\d+)%E5%B9%B4\/(\d+)%E6%9C%88(\d+)E6%97%A5/` → match[1] YYYY match[2] M match[3] DD → date in ISO 8601
  let date = "";
  const viewLink = $("a")
    .filter((i, el) => $(el).text().trim() === "檢視")
    .first();
  if (viewLink.length) {
    const href = viewLink.attr("href") || "";
    const match = href.match(/\/(\d+)%E5%B9%B4\/(\d+)%E6%9C%88(\d+)%E6%97%A5/);
    if (match) {
      const year = match[1];
      const month = match[2].padStart(2, "0");
      const day = match[3].padStart(2, "0");
      date = `${year}-${month}-${day}`;
    }
  }

  return {
    word,
    partOfSpeech,
    definitions: filterEmptyStrings(definitions),
    date,
  };
}

function parseZhFwotd($) {
  // lang: `a[href^="/wiki/Category:"]` → innerText
  const language = $('a[href^="/wiki/Category:"]').text() || "";

  // word: `.mf-wotd > div:first-child > b` → processDescriptions → innerHTML
  const wordElement = $(".mf-wotd > div:first-child > b");
  const word = wordElement.length ? processDescriptions(wordElement, $) : "";

  // partOfSpeech: `.mf-wotd > div:first-child` removing its `> b` children → innerText
  const mfWotdElement = $(".mf-wotd > div:first-child").clone();
  mfWotdElement.find("b").remove();
  const partOfSpeech = mfWotdElement.text().trim() || "";

  // definitions: `#WOTD-rss-description > ol > li, #WOTD-rss-description > p` → remove `> b` children → processDescriptions
  const definitions = [];
  $("#WOTD-rss-description > ol > li, #WOTD-rss-description > p").each(
    (i, el) => {
      const element = $(el).clone();
      element.find("> b").remove();
      definitions.push(processDescriptions(element, $));
    }
  );

  // date: `a` has content `"檢視"` → match href with `/\/(\d+)%E5%B9%B4\/(\d+)%E6%9C%88(\d+)E6%97%A5/` → match[1] YYYY match[2] M match[3] DD → date in ISO 8601
  let date = "";
  const viewLink = $("a")
    .filter((i, el) => $(el).text().trim() === "檢視")
    .first();
  if (viewLink.length) {
    const href = viewLink.attr("href") || "";
    const match = href.match(/\/(\d+)%E5%B9%B4\/(\d+)%E6%9C%88(\d+)%E6%97%A5/);
    if (match) {
      const year = match[1];
      const month = match[2].padStart(2, "0");
      const day = match[3].padStart(2, "0");
      date = `${year}-${month}-${day}`;
    }
  }

  return {
    lang: language,
    word,
    partOfSpeech,
    definitions: filterEmptyStrings(definitions),
    date,
  };
}

async function parseWotD(html, lang, type) {
  const $ = cheerio.load(html);

  if (lang === "en" && type === "wotd") {
    return parseEnWotd($);
  }

  if (lang === "en" && type === "fwotd") {
    return parseEnFwotd($);
  }

  if (lang === "ja" && type === "wotw") {
    return parseJaWotw($);
  }

  if (lang === "zh" && type === "wotd") {
    return parseZhWotd($);
  }

  if (lang === "zh" && type === "fwotd") {
    return parseZhFwotd($);
  }

  // TODO: Implement parsing for other language/type combinations
  return { todo: `Parsing for lang=${lang}, type=${type} not yet implemented` };
}

export async function wotd() {
  console.log(`Fetching WOTD for ${SOURCES.length} sources...`);
  for (const { id, lang, type, url } of SOURCES) {
    try {
      const html = await fetchWotD(url);
      const data = await parseWotD(html, lang, type);
      await writeFile(`dist/${id}.json`, JSON.stringify(data, null, 2), "utf8");
      console.log(`Wrote ${id}.json, date: ${data.date || "n/a"}`);
    } catch (e) {
      console.error(`Failed ${id}: ${e.message}`, e);
      const out = {
        id,
        lang,
        type,
        error: e.message,
      };
      await writeFile(`dist/${id}.json`, JSON.stringify(out, null, 2), "utf8");
    }
  }
}
