/**
 * A fetch wrapper for Wikimedia endpoints that handles HTTP 429
 * (Too Many Requests) gracefully: emits a GitHub Actions warning command on
 * stdout (stdout is required — GitHub Actions only parses workflow commands
 * from stdout, not stderr) and returns null so that the caller can skip the
 * item and continue.
 *
 * All other non-ok responses still throw an Error.
 *
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<Response|null>} null when rate-limited (HTTP 429)
 */
export async function wikimediaFetch(url, options = {}) {
  const res = await fetch(url, options);

  if (res.status === 429) {
    console.log(
      `::warning::Rate limited (HTTP 429) fetching ${url}. Skipping and continuing.`
    );
    return null;
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }

  return res;
}
