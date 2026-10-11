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

    const options = { method, headers };

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url.toString(), options);

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
