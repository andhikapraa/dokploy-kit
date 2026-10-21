/**
 * Dokploy API HTTP Client
 * Handles authentication and request execution against the Dokploy API.
 */

class DokployClient {
  constructor(baseUrl, apiKey) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
  }

  /**
   * Execute an API request
   * @param {string} path - API path (e.g., '/project.all')
   * @param {string} method - HTTP method
   * @param {Object} queryParams - Query parameters
   * @param {Object|null} body - Request body for POST/PUT
   * @returns {Promise<Object|string|null>} Parsed JSON, raw text for non-JSON
   *   bodies, or null when the response body is empty (Dokploy procedures that
   *   return void respond 200 with an empty body).
   */
  async request(path, method = 'GET', queryParams = {}, body = null) {
    const url = new URL(`${this.baseUrl}${path}`);

    // Add query parameters
    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }

    const headers = {
      'x-api-key': this.apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    // fetch keeps custom headers on redirects, including cross-origin ones, so
    // a redirect to another host would receive the API key. Follow redirects
    // ourselves: same-origin hops are safe and keep canonicalizing setups
    // working; a hop to another origin (scheme, host, or port) is refused.
    const options = { method, headers, redirect: 'manual' };

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(body);
    }

    let current = url;
    let response;
    for (let hops = 0; ; hops++) {
      response = await fetch(current.toString(), options);
      if (response.status < 300 || response.status >= 400) break;
      const location = response.headers.get('location');
      const next = location ? new URL(location, current) : null;
      if (!next) {
        throw new Error(`Dokploy API error (${response.status}): redirect without a Location header`);
      }
      if (next.origin !== current.origin) {
        throw new Error(
          `Dokploy API error (${response.status}): refusing to follow redirect to ${location}. ` +
          'It points to a different origin, which would receive your API key. ' +
          'Use the final address as the base URL (for example https:// instead of http://).'
        );
      }
      if (hops >= 5) throw new Error(`Dokploy API error (${response.status}): too many redirects`);
      // 303, and 301/302 after POST, switch to GET without a body, as fetch would.
      if (response.status === 303 || ((response.status === 301 || response.status === 302) && options.method === 'POST')) {
        options.method = 'GET';
        delete options.body;
      }
      // Release the redirect response before the next request.
      await response.body?.cancel();
      current = next;
    }

    const data = parseBody(
      await response.text(),
      response.headers.get('content-type') || ''
    );

    if (!response.ok) {
      const errorMsg = data === null
        ? response.statusText || '(empty response body)'
        : typeof data === 'object'
          ? data.message || JSON.stringify(data)
          : data;
      throw new Error(`Dokploy API error (${response.status}): ${errorMsg}`);
    }

    return data;
  }
}

/**
 * Decode a response body. Reading text first (instead of response.json())
 * lets an empty body on a JSON content-type resolve to null rather than
 * throwing "Unexpected end of JSON input" after a successful request.
 */
function parseBody(text, contentType) {
  if (text.trim() === '') return null;
  if (!contentType.includes('application/json')) return text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

module.exports = { DokployClient, parseBody };
