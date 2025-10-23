import OpenAI from 'openai';
import { OPENAI_API_KEY } from '@env';

let client = null;
if (OPENAI_API_KEY && OPENAI_API_KEY !== 'sk-YOUR_ACTUAL_API_KEY_HERE') {
  client = new OpenAI({ apiKey: OPENAI_API_KEY });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Call a function with retries on transient errors (429, 5xx, network errors).
 * fn should be an async function that performs the request.
 */
async function callWithRetry(fn, { retries = 3, minDelay = 500 } = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      const status = err?.response?.status || err?.status || null;
      const isTransient = !status || status === 429 || (status >= 500 && status < 600);
      if (attempt > retries || !isTransient) {
        throw err;
      }
      const delay = minDelay * Math.pow(2, attempt - 1);
      await sleep(delay);
    }
  }
}

export { client as openaiClient, callWithRetry };
