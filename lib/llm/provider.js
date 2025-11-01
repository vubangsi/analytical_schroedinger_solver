/**
 * LLM Provider Configuration
 * Supports multiple LLM providers
 */

/**
 * Get LLM configuration based on provider
 * @param {string} provider - 'groq', 'openrouter', 'openai', 'gemini', 'sambanova', 'nvidia', or 'cerebras'
 * @returns {Object} Configuration object with apiUrl, apiKey, model, and headers
 */
export function getLLMConfig(provider = 'nvidia') {
  // OpenRouter
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

  // OpenAI
  if (provider === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || 'gpt-4o';
    const apiUrl = process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions';

    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not set');
    }

    return {
      apiUrl,
      apiKey,
      model,
      provider: 'openai',
      extraHeaders: {},
    };
  }

  // Google Gemini
  if (provider === 'gemini') {
    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL || 'gemini-1.5-pro';
    const baseUrl = process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta/models';
    const apiUrl = `${baseUrl}/${model}:generateContent`;

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not set');
    }

    return {
      apiUrl,
      apiKey,
      model,
      provider: 'gemini',
      extraHeaders: {},
      isGemini: true, // Flag to handle different API format
    };
  }

  // SambaNova
  if (provider === 'sambanova') {
    const apiKey = process.env.SAMBANOVA_API_KEY;
    const model = process.env.SAMBANOVA_MODEL || 'Meta-Llama-3.1-405B-Instruct';
    const apiUrl = process.env.SAMBANOVA_API_URL || 'https://api.sambanova.ai/v1/chat/completions';

    if (!apiKey) {
      throw new Error('SAMBANOVA_API_KEY not set');
    }

    return {
      apiUrl,
      apiKey,
      model,
      provider: 'sambanova',
      extraHeaders: {},
    };
  }

  // NVIDIA NIM
  if (provider === 'nvidia') {
    const apiKey = process.env.NVIDIA_API_KEY;
    const model = process.env.NVIDIA_MODEL || 'meta/llama-4-maverick-17b-128e-instruct';
    const apiUrl = process.env.NVIDIA_API_URL || 'https://integrate.api.nvidia.com/v1/chat/completions';

    if (!apiKey) {
      throw new Error('NVIDIA_API_KEY not set');
    }

    return {
      apiUrl,
      apiKey,
      model,
      provider: 'nvidia',
      extraHeaders: {},
    };
  }

  // Cerebras
  if (provider === 'cerebras') {
    const apiKey = process.env.CEREBRAS_API_KEY;
    const model = process.env.CEREBRAS_MODEL || 'llama-3.3-70b';
    const apiUrl = process.env.CEREBRAS_API_URL || 'https://api.cerebras.ai/v1/chat/completions';

    if (!apiKey) {
      throw new Error('CEREBRAS_API_KEY not set');
    }

    return {
      apiUrl,
      apiKey,
      model,
      provider: 'cerebras',
      extraHeaders: {},
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
 * @param {string} params.provider - 'groq', 'openrouter', 'openai', 'gemini', 'sambanova', 'nvidia', or 'cerebras'
 * @param {Array} params.messages - Chat messages
 * @param {number} params.temperature - Temperature setting
 * @param {number} params.maxTokens - Max tokens to generate
 * @param {Object} params.responseFormat - Response format (e.g., { type: 'json_object' })
 * @param {number} params.maxRetries - Maximum retry attempts
 * @param {number} params.baseDelayMs - Base delay for exponential backoff
 * @returns {Promise<Object>} API response
 */
export async function callLLM({
  provider = 'nvidia',
  messages,
  temperature = 0.1,
  maxTokens = 4000,
  responseFormat = null,
  maxRetries = 3,
  baseDelayMs = 500,
}) {
  const config = getLLMConfig(provider);

  // Handle Gemini's different API format
  if (config.isGemini) {
    return await callGemini({
      apiUrl: config.apiUrl,
      apiKey: config.apiKey,
      messages,
      temperature,
      maxTokens,
      maxRetries,
      baseDelayMs,
    });
  }

  // Standard OpenAI-compatible format (Groq, OpenRouter, OpenAI, SambaNova, NVIDIA, Cerebras)
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

/**
 * Call Google Gemini API with its specific format
 */
async function callGemini({ apiUrl, apiKey, messages, temperature, maxTokens, maxRetries, baseDelayMs }) {
  const retries = Number.isFinite(Number(maxRetries)) ? Number(maxRetries) : 3;
  const base = Number.isFinite(Number(baseDelayMs)) ? Number(baseDelayMs) : 500;
  let attempt = 0;
  let lastErr;

  // Convert OpenAI-style messages to Gemini format
  const geminiContents = messages.map(msg => {
    if (msg.role === 'system') {
      // Gemini doesn't have system role, prepend to first user message
      return null;
    }
    return {
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    };
  }).filter(Boolean);

  // Prepend system message to first user message if exists
  const systemMsg = messages.find(m => m.role === 'system');
  if (systemMsg && geminiContents.length > 0) {
    geminiContents[0].parts[0].text = `${systemMsg.content}\n\n${geminiContents[0].parts[0].text}`;
  }

  const body = {
    contents: geminiContents,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      responseMimeType: 'application/json', // Request JSON output
    },
  };

  while (attempt <= retries) {
    try {
      const url = `${apiUrl}?key=${apiKey}`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (resp.status === 429 || resp.status >= 500) {
        const t = await resp.text().catch(() => '');
        lastErr = new Error(`HTTP ${resp.status} ${t?.slice(0, 200) || ''}`);
      } else if (!resp.ok) {
        const t = await resp.text().catch(() => '');
        throw new Error(`HTTP ${resp.status} ${t?.slice(0, 200) || ''}`);
      } else {
        const data = await resp.json();

        // Convert Gemini response to OpenAI format
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        return {
          choices: [{
            message: {
              content: text,
              role: 'assistant'
            }
          }]
        };
      }
    } catch (e) {
      lastErr = e;
    }

    const wait = base * Math.pow(2, attempt) + Math.floor(Math.random() * 100);
    await delay(wait);
    attempt++;
  }

  throw lastErr || new Error('Gemini API call failed');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

