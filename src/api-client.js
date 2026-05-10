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
   * @returns {Promise<Object>} Response data
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

    let data;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      const errorMsg = typeof data === 'object'
        ? data.message || JSON.stringify(data)
        : data;
      throw new Error(`Dokploy API error (${response.status}): ${errorMsg}`);
    }

    return data;
  }
}

module.exports = { DokployClient };
