import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const cacheDirectory = join(".cache", "wikimedia");

/**
 * A fetch wrapper for Wikimedia endpoints that handles HTTP 429
 * (Too Many Requests) gracefully: retries up to 5 times using the
 * Retry-After header, then emits a GitHub Actions warning command on stdout
 * (stdout is required — GitHub Actions only parses workflow commands from
 * stdout, not stderr) and returns null so that the caller can skip the item
 * and continue.
 *
 * GET responses from api.wikimedia.org with an ETag are persisted and
 * revalidated with If-None-Match. A 304 returns the cached response as a 200.
 * All other non-ok responses still throw an Error.
 *
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<Response|null>} null when rate-limited (HTTP 429)
 */
export async function wikimediaFetch(url, options = {}) {
  const maxRetries = 5;
  const headers = new Headers(options.headers);
  const cacheable = new URL(url).hostname === "api.wikimedia.org" &&
    (options.method ?? "GET").toUpperCase() === "GET" &&
    !headers.has("if-none-match") && !headers.has("if-modified-since");
  const cachePath = cacheable
    ? join(cacheDirectory, `${createHash("sha256")
      .update(JSON.stringify([url, [...headers.entries()].sort()]))
      .digest("hex")}.json`)
    : null;
  const cached = cachePath ? await readCachedResponse(cachePath) : null;
  if (cached) headers.set("if-none-match", cached.etag);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, { ...options, headers });

    if (res.status === 304 && cached) {
      const responseHeaders = new Headers(cached.headers);
      for (const [name, value] of res.headers) responseHeaders.set(name, value);
      const updated = {
        ...cached,
        etag: responseHeaders.get("etag"),
        headers: [...responseHeaders.entries()],
      };
      await writeCachedResponse(cachePath, updated);
      return new Response(Buffer.from(cached.body, "base64"), {
        status: 200,
        headers: responseHeaders,
      });
    }

    if (res.status === 429) {
      if (attempt < maxRetries) {
        const retryAfter = res.headers.get("retry-after");
        const delayMs = retryAfterToMilliseconds(retryAfter);

        console.log(
          `::warning::Rate limited (HTTP 429) fetching ${url}. Retrying in ${formatDelay(delayMs)} (${attempt + 1}/${maxRetries}).`
        );

        await res.body?.cancel();
        await sleep(delayMs);
        continue;
      }

      const headers = Object.fromEntries(res.headers.entries());
      const body = await res.text();
      console.log(
        `::warning::Rate limited (HTTP 429) fetching ${url} after ${maxRetries} retries. Skipping and continuing.`
      );
      console.log(`Response headers: ${JSON.stringify(headers, null, 2)}`);
      console.log(`Response body: ${body}`);
      return null;
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}`);
    }

    if (cachePath && res.status === 200) {
      const etag = res.headers.get("etag");
      if (etag) {
        await writeCachedResponse(cachePath, {
          etag,
          headers: [...res.headers.entries()],
          body: Buffer.from(await res.clone().arrayBuffer()).toString("base64"),
        });
      } else {
        // A response without a validator supersedes any older cached version.
        await rm(cachePath, { force: true });
      }
    }

    return res;
  }
}

async function readCachedResponse(path) {
  let contents;
  try {
    contents = await readFile(path, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
  const cached = JSON.parse(contents);
  if (!cached || typeof cached.etag !== "string" || !cached.etag ||
      typeof cached.body !== "string" || !Array.isArray(cached.headers)) {
    throw new Error(`Invalid Wikimedia response cache: ${path}`);
  }
  return cached;
}

async function writeCachedResponse(path, cached) {
  await mkdir(cacheDirectory, { recursive: true });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, JSON.stringify(cached), "utf8");
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

function retryAfterToMilliseconds(retryAfter) {
  if (!retryAfter) {
    return 0;
  }

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const retryAt = Date.parse(retryAfter);
  if (Number.isFinite(retryAt)) {
    return Math.max(retryAt - Date.now(), 0);
  }

  return 0;
}

function formatDelay(delayMs) {
  return `${Math.ceil(delayMs / 1000)}s`;
}

function sleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
