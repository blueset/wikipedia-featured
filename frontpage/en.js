import * as cheerio from "cheerio";
import { writeFile } from "fs/promises";
import { smartquotesHtml, smartquotesText } from "../src/smartquotes-html.js";
import { wikimediaFetch } from "../src/fetch.js";


async function inTheNewsEn() {
  const res = await wikimediaFetch(
    "https://en.wikipedia.org/w/api.php?action=parse&page=Template:In_the_news&prop=text&formatversion=2&format=json",
    {
      headers: {
        accept: "application/json; charset=utf-8",
        // Wikimedia requests a descriptive UA. Adjust if you fork.
        "user-agent": "wikipedia-featured-json/1.0 (GitHub Actions)",
      },
    }
  );
  if (res === null) return; // Rate limited — warning already printed.
  const json = await res.json();
  const html = json.parse.text;
  const $ = cheerio.load(html);

  // 1. Image
  const $imgContainer = $(".itn-img").first();
  const $img = $imgContainer.find("img");
  const image = {
    url: $img.attr("src") ? `https:${$img.attr("src")}` : "",
    alt: smartquotesText($img.attr("alt") || ""),
    caption: smartquotesText($imgContainer.find(".thumbcaption").text().trim()),
  };

  // 2. Headlines
  // The first <ul> in the output usually contains the news items.
  // Sometimes there is a figure before it.
  const headlines = [];
  const $newsList = $("ul").first();
  $newsList.find("li").each((_, el) => {
    // We want the inner HTML, but usually cleaned up a bit (e.g. relative links)
    // For now, just raw HTML of the li content.
    headlines.push({
      html: smartquotesHtml($(el).html()?.trim() || ""),
      text: smartquotesText($(el).text().trim()),
    });
  });

  // 3. Footer sections (Ongoing, Recent deaths)
  const ongoing = [];
  const recentDeaths = [];

  // The footer is usually in a div with class "itn-footer"
  const $footer = $(".itn-footer").first();

  // "Ongoing" is usually the first div inside footer, text starts with "Ongoing:"
  // Structure: <div> <b>Ongoing</b>: <div class="hlist inline"><ul>...</ul></div> </div>
  const $ongoingContainer = $footer
    .find("div")
    .filter((_, el) => $(el).text().trim().startsWith("Ongoing"))
    .first();

  $ongoingContainer.find(".hlist > ul > li").each((_, el) => {
    const $mainLink = $(el).children("a").first();
    if ($mainLink.length > 0) {
      const item = {
        text: smartquotesText($mainLink.text() || ""),
        title: smartquotesText($mainLink.attr("title") || ""),
        url: $mainLink.attr("href") ? `https://en.wikipedia.org${$mainLink.attr("href")}` : "",
        relevantLinks: [],
      };

      // Sub-lists for timeline/genocide etc.
      $(el)
        .find("ul li a")
        .each((_, subEl) => {
          item.relevantLinks.push({
            text: smartquotesText($(subEl).text() || ""),
            title: smartquotesText($(subEl).attr("title") || ""),
            url: $(subEl).attr("href") ? `https://en.wikipedia.org${$(subEl).attr("href")}` : "",
          });
        });

      ongoing.push(item);
    }
  });

  // "Recent deaths" is usually the second div, text starts with "Recent deaths:"
  const $deathsContainer = $footer
    .find("div")
    .filter((_, el) => $(el).text().trim().startsWith("Recent deaths"))
    .first();

  $deathsContainer.find(".hlist ul li").each((_, el) => {
    const $link = $(el).find("a").first();
    if ($link.length > 0) {
      recentDeaths.push({
        name: smartquotesText($link.attr("title") || $link.text()),
        url: $link.attr("href") ? `https://en.wikipedia.org${$link.attr("href")}` : "",
      });
    }
  });

  const data = {
    image,
    headlines,
    ongoing,
    recentDeaths,
  };

  await writeFile(`dist/en_itn.json`, JSON.stringify(data, null, 2), "utf8");
}

async function didYouKnowEn() {
  const res = await wikimediaFetch(
    "https://en.wikipedia.org/w/api.php?action=parse&page=Template:Did_you_know&prop=text&formatversion=2&format=json",
    {
      headers: {
        accept: "application/json; charset=utf-8",
        "user-agent": "wikipedia-featured-json/1.0 (GitHub Actions)",
      },
    }
  );
  if (res === null) return; // Rate limited — warning already printed.
  const json = await res.json();
  const html = json.parse.text;
  const $ = cheerio.load(html);

  const $imgContainer = $(".dyk-img").first();
  const $img = $imgContainer.find("img");
  const image = {
    url: $img.attr("src") ? `https:${$img.attr("src")}` : "",
    alt: smartquotesText($img.attr("alt") || ""),
    caption: smartquotesText($imgContainer.find(".thumbcaption").text().trim()),
  };

  const facts = [];
  const $list = $(".mw-parser-output > ul").first();
  $list.find("li").each((_, el) => {
    facts.push({
      html: smartquotesHtml($(el).html()?.trim() || ""),
      text: smartquotesText($(el).text().trim()),
    });
  });

  const data = {
    image,
    facts,
  };

  await writeFile(`dist/en_dyn.json`, JSON.stringify(data, null, 2), "utf8");
}

export async function frontPageEn() {
  console.log(`Fetching front page data for English...`);
  await inTheNewsEn();
  await didYouKnowEn();
}
