
import * as cheerio from "cheerio";
import { writeFile } from "fs/promises";

async function inTheNewsZh() {
  const res = await fetch(
    "https://zh.wikipedia.org/w/api.php?action=parse&page=Template:Itn&prop=text&formatversion=2&format=json",
    {
      headers: {
        accept: "application/json; charset=utf-8",
        "user-agent": "wikipedia-featured-json/1.0 (GitHub Actions)",
      },
    }
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch in the news: ${res.statusText}`);
  }
  const json = await res.json();
  const html = json.parse.text;
  const $ = cheerio.load(html);

  // 1. Image
  const $imgContainer = $("#column-itn figure").first();
  const $img = $imgContainer.find("img");
  const image = {
    url: $img.attr("src") ? `https:${$img.attr("src")}` : "",
    alt: $img.attr("alt") || "",
    caption: $imgContainer.find("figcaption").text().trim(),
  };

  // 2. Headlines
  const headlines = [];
  const $newsList = $("#column-itn ul").first();
  $newsList.find("li").each((_, el) => {
    headlines.push({
      html: $(el).html()?.trim() || "",
      text: $(el).text().trim(),
    });
  });

  // 3. Footer sections (Ongoing, Recent deaths)
  const ongoing = [];
  const recentDeaths = [];

  // Find all footer sections
  const $footerSections = $("#column-feature-more");

  $footerSections.each((_, section) => {
    const $section = $(section);
    const headerText = $section.find(".column-feature-more-header").text().trim();

    if (headerText.includes("正在发生")) {
      // Ongoing
      $section.find(".hlist.inline a").each((_, el) => {
        const $link = $(el);
        // Skip if it's part of the header (though selector .hlist.inline should avoid it)
        if ($link.closest(".column-feature-more-header").length > 0) return;

        ongoing.push({
          text: $link.text() || "",
          title: $link.attr("title") || "",
          url: $link.attr("href") ? `https://zh.wikipedia.org${$link.attr("href")}` : "",
        });
      });
    } else if (headerText.includes("最近逝世")) {
      // Recent deaths
      $section.find(".hlist.inline a").each((_, el) => {
        const $link = $(el);
        if ($link.closest(".column-feature-more-header").length > 0) return;

        recentDeaths.push({
          name: $link.attr("title") || $link.text(),
          url: $link.attr("href") ? `https://zh.wikipedia.org${$link.attr("href")}` : "",
        });
      });
    }
  });

  const data = {
    image,
    headlines,
    ongoing,
    recentDeaths,
  };

  await writeFile(`dist/zh_itn.json`, JSON.stringify(data, null, 2), "utf8");
}

async function didYouKnowZh() {
  const res = await fetch(
    "https://zh.wikipedia.org/w/api.php?action=parse&page=Template:Dyk&prop=text&formatversion=2&format=json",
    {
      headers: {
        accept: "application/json; charset=utf-8",
        "user-agent": "wikipedia-featured-json/1.0 (GitHub Actions)",
      },
    }
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch did you know: ${res.statusText}`);
  }
  const json = await res.json();
  const html = json.parse.text;
  const $ = cheerio.load(html);

  const $imgContainer = $("#column-dyk figure").first();
  const $img = $imgContainer.find("img");
  const image = {
    url: $img.attr("src") ? `https:${$img.attr("src")}` : "",
    alt: $img.attr("alt") || "",
    caption: $imgContainer.find("figcaption").text().trim(),
  };

  const facts = [];
  const $list = $("#column-dyk ul").first();
  $list.find("li").each((_, el) => {
    facts.push({
      html: $(el).html()?.trim() || "",
      text: $(el).text().trim(),
    });
  });

  const data = {
    image,
    facts,
  };

  await writeFile(`dist/zh_dyn.json`, JSON.stringify(data, null, 2), "utf8");
}

export async function frontPageZh() {
  console.log(`Fetching front page data for Chinese...`);
  await inTheNewsZh();
  await didYouKnowZh();
}
