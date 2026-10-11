import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { wikimediaFetch } from "./fetch.js";
import { getLatestAvailableTfa } from "../tfa/index.js";

const originalDirectory = process.cwd();
let directory;
const url = "https://api.wikimedia.org/feed/v1/wikipedia/en/featured/2026/10/11";

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "wikimedia-etag-"));
  process.chdir(directory);
});

beforeEach(async () => {
  await rm(join(directory, ".cache"), { recursive: true, force: true });
});

after(async () => {
  process.chdir(originalDirectory);
  await rm(directory, { recursive: true, force: true });
});

function jsonResponse(body, etag) {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
      ...(etag ? { etag } : {}),
    },
  });
}

test("persists ETags and bodies and reuses them on 304", async (t) => {
  const body = { tfa: { title: "Featured article", extract: "\u00e9" } };
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (requestedUrl, options) => {
    assert.equal(requestedUrl, url);
    assert.equal(options.headers.get("accept"), "application/json");
    calls++;
    if (calls === 1) {
      assert.equal(options.headers.get("if-none-match"), null);
      return jsonResponse(body, 'W/"first"');
    }
    assert.equal(options.headers.get("if-none-match"), calls === 2 ? 'W/"first"' : '"second"');
    return new Response(null, { status: 304, headers: { etag: '"second"' } });
  });
  const headers = { accept: "application/json" };
  assert.deepEqual(await (await wikimediaFetch(url, { headers })).json(), body);
  const cachePath = join(directory, ".cache", "wikimedia");
  const files = await readdir(cachePath);
  assert.equal(files.length, 1);
  const saved = JSON.parse(await readFile(join(cachePath, files[0]), "utf8"));
  assert.equal(saved.etag, 'W/"first"');
  assert.deepEqual(JSON.parse(Buffer.from(saved.body, "base64").toString()), body);
  for (let i = 0; i < 2; i++) {
    const response = await wikimediaFetch(url, { headers });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("etag"), '"second"');
    assert.deepEqual(await response.json(), body);
  }
  assert.deepEqual(headers, { accept: "application/json" });
});

test("changed responses replace both the body and ETag", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_, options) => {
    calls++;
    assert.equal(options.headers.get("if-none-match"), [null, '"one"', '"two"'][calls - 1]);
    return calls < 3
      ? jsonResponse({ version: calls }, calls === 1 ? '"one"' : '"two"')
      : new Response(null, { status: 304 });
  });
  assert.deepEqual(await (await wikimediaFetch(url)).json(), { version: 1 });
  assert.deepEqual(await (await wikimediaFetch(url)).json(), { version: 2 });
  assert.deepEqual(await (await wikimediaFetch(url)).json(), { version: 2 });
});

test("TFA lookback reuses cached feeds without changing the article or date", async (t) => {
  const article = { titles: { display: "Featured article" }, extract: "Article text" };
  const requests = new Set();
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (requestedUrl, options) => {
    calls++;
    if (requests.has(requestedUrl)) {
      assert.equal(options.headers.get("if-none-match"), '"feed"');
      return new Response(null, { status: 304 });
    }
    requests.add(requestedUrl);
    assert.equal(options.headers.get("if-none-match"), null);
    return jsonResponse(requestedUrl.endsWith("/11") ? {} : { tfa: article }, '"feed"');
  });
  const date = new Date("2026-10-11T00:00:00.000Z");
  const expected = { tfa: article, usedDate: new Date("2026-10-10T00:00:00.000Z") };
  assert.deepEqual(await getLatestAvailableTfa("en", date, 1), expected);
  assert.deepEqual(await getLatestAvailableTfa("en", date, 1), expected);
  assert.equal(calls, 4);
});

test("separates dates, languages, and request representations", async (t) => {
  const urls = [url, url.replace("/en/", "/de/"), url.replace("/11", "/10")];
  t.mock.method(globalThis, "fetch", async (_, options) => {
    assert.equal(options.headers.get("if-none-match"), null);
    return jsonResponse({}, '"one"');
  });
  for (const requestUrl of urls) await wikimediaFetch(requestUrl);
  await wikimediaFetch(url, { headers: [["accept", "application/json"]] });
  assert.equal((await readdir(join(directory, ".cache", "wikimedia"))).length, 4);
});

test("a response without ETag removes the stale validator", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_, options) => {
    calls++;
    assert.equal(options.headers.get("if-none-match"), calls === 2 ? '"one"' : null);
    return jsonResponse({ version: calls }, calls === 1 ? '"one"' : null);
  });
  for (let i = 0; i < 3; i++) await wikimediaFetch(url);
  assert.deepEqual(await readdir(join(directory, ".cache", "wikimedia")), []);
});

test("does not cache other hosts, non-GET, or explicit conditional requests", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonResponse({}, '"one"'));
  await wikimediaFetch("https://en.wikipedia.org/w/api.php");
  await wikimediaFetch(url, { method: "POST" });
  await wikimediaFetch(url, { headers: { "If-None-Match": '"caller"' } });
  await assert.rejects(readdir(join(directory, ".cache")), { code: "ENOENT" });
});

test("304 without cached content and other HTTP errors still throw", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 304 }));
  await assert.rejects(wikimediaFetch(url), /HTTP 304/);
  fetchMock.mock.mockImplementation(async () => new Response(null, { status: 500 }));
  await assert.rejects(wikimediaFetch(url), /HTTP 500/);
});

test("429 retries retain the ETag and can finish with cached content", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_, options) => {
    calls++;
    if (calls === 1) return jsonResponse({ tfa: {} }, '"one"');
    assert.equal(options.headers.get("if-none-match"), '"one"');
    return new Response(null, { status: calls === 2 ? 429 : 304 });
  });
  await wikimediaFetch(url);
  assert.deepEqual(await (await wikimediaFetch(url)).json(), { tfa: {} });
  assert.equal(calls, 3);
});

test("exhausted rate limits still return null", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response(null, { status: 429 });
  });
  assert.equal(await wikimediaFetch(url), null);
  assert.equal(calls, 6);
});
