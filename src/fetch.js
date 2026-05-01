const MAX_RETRIES = 5;

/**
 * A fetch wrapper for Wikimedia endpoints that handles HTTP 429
 * (Too Many Requests) gracefully: retries up to 5 times, honouring the
 * `retry-after` response header (interpreted as seconds) between attempts.
 * A GitHub Actions warning command is emitted on stdout (stdout is required —
 * GitHub Actions only parses workflow commands from stdout, not stderr) for
 * each attempt. After all retries are exhausted the function returns null so
 * that the caller can skip the item and continue.
 *
 * All other non-ok responses still throw an Error.
 *
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<Response|null>} null when rate-limited (HTTP 429) after all retries
 */
export async function wikimediaFetch(url, options = {}) {
  // Total attempts = 1 initial + MAX_RETRIES retries.
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, options);

    if (res.status === 429) {
      const headers = Object.fromEntries(res.headers.entries());
      const body = await res.text();

      if (attempt < MAX_RETRIES) {
        const retryAfterSec = parseInt(headers["retry-after"], 10) || 60;
        console.log(
          `::warning::Rate limited (HTTP 429) fetching ${url}. ` +
            `Retry ${attempt + 1}/${MAX_RETRIES} after ${retryAfterSec}s.`
        );
        console.log(`Response headers: ${JSON.stringify(headers, null, 2)}`);
        console.log(`Response body: ${body}`);
        await new Promise((resolve) =>
          setTimeout(resolve, retryAfterSec * 1000)
        );
        continue;
      }

      // All retries exhausted.
      console.log(
        `::warning::Rate limited (HTTP 429) fetching ${url}. ` +
          `All ${MAX_RETRIES} retries exhausted. Skipping and continuing.`
      );
      console.log(`Response headers: ${JSON.stringify(headers, null, 2)}`);
      console.log(`Response body: ${body}`);
      return null;
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}`);
    }

    return res;
  }

  /* istanbul ignore next — unreachable, loop always returns or continues */
  return null;
}
