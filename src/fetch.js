/**
 * A fetch wrapper for Wikimedia endpoints that handles HTTP 429
 * (Too Many Requests) gracefully: retries up to 5 times using the
 * Retry-After header, then emits a GitHub Actions warning command on stdout
 * (stdout is required — GitHub Actions only parses workflow commands from
 * stdout, not stderr) and returns null so that the caller can skip the item
 * and continue.
 *
 * All other non-ok responses still throw an Error.
 *
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<Response|null>} null when rate-limited (HTTP 429)
 */
export async function wikimediaFetch(url, options = {}) {
  const maxRetries = 5;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options);

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

    return res;
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
