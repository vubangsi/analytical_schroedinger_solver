/**
 * LLM Provider Configuration
 * Supports both Groq and OpenRouter
 */

/**
 * Get LLM configuration based on provider
 * @param {string} provider - 'groq' or 'openrouter'
 * @returns {Object} Configuration object with apiUrl, apiKey, model, and headers
 */
export function getLLMConfig(provider = 'groq') {
  if (provider === 'openrouter') {
    const apiKey = process.env.OPENROUTER_API_KEY;
    const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o';
    const apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
    
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY not set');
    }

    return {
      apiUrl,
      apiKey,
      model,
      provider: 'openrouter',
      extraHeaders: {
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://eqnsolver.vercel.app',
        'X-Title': process.env.OPENROUTER_SITE_TITLE || 'AI Equation Solver',
      },
    };
  }

  // Default to Groq
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
  const apiUrl = process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions';

  if (!apiKey) {
    throw new Error('GROQ_API_KEY not set');
  }

  return {
    apiUrl,
    apiKey,
    model,
    provider: 'groq',
    extraHeaders: {},
  };
}

/**
 * Make an LLM API call with the specified provider
 * @param {Object} params
 * @param {string} params.provider - 'groq' or 'openrouter'
 * @param {Array} params.messages - Chat messages
 * @param {number} params.temperature - Temperature setting
 * @param {number} params.maxTokens - Max tokens to generate
 * @param {Object} params.responseFormat - Response format (e.g., { type: 'json_object' })
 * @param {number} params.maxRetries - Maximum retry attempts
 * @param {number} params.baseDelayMs - Base delay for exponential backoff
 * @returns {Promise<Object>} API response
 */
export async function callLLM({
  provider = 'groq',
  messages,
  temperature = 0.1,
  maxTokens = 4000,
  responseFormat = null,
  maxRetries = 3,
  baseDelayMs = 500,
}) {
  const config = getLLMConfig(provider);
  
  const body = {
    model: config.model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  if (responseFormat) {
    body.response_format = responseFormat;
  }

  return await callChatWithRetry({
    apiUrl: config.apiUrl,
    apiKey: config.apiKey,
    extraHeaders: config.extraHeaders,
    body,
    maxRetries,
    baseDelayMs,
  });
}

/**
 * Internal function to make API calls with retry logic
 */
async function callChatWithRetry({ apiUrl, apiKey, extraHeaders, body, maxRetries, baseDelayMs }) {
  const retries = Number.isFinite(Number(maxRetries)) ? Number(maxRetries) : 3;
  const base = Number.isFinite(Number(baseDelayMs)) ? Number(baseDelayMs) : 500;
  let attempt = 0;
  let lastErr;

  while (attempt <= retries) {
    try {
      const headers = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...extraHeaders,
      };

      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (resp.status === 429 || resp.status >= 500) {
        const t = await resp.text().catch(() => '');
        lastErr = new Error(`HTTP ${resp.status} ${t?.slice(0, 200) || ''}`);
      } else if (!resp.ok) {
        const t = await resp.text().catch(() => '');
        throw new Error(`HTTP ${resp.status} ${t?.slice(0, 200) || ''}`);
      } else {
        return await resp.json();
      }
    } catch (e) {
      lastErr = e;
    }

    // Exponential backoff before next attempt
    const wait = base * Math.pow(2, attempt) + Math.floor(Math.random() * 100);
    await delay(wait);
    attempt++;
  }

  throw lastErr || new Error('API call failed');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

