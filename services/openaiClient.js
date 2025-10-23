// services/openaiClient.js
// Deprecated: OpenAI calls should go through the secure backend function `jeyProxy`.
// This stub intentionally throws to prevent accidental client-side usage.

function _throwDeprecated() {
  throw new Error('openaiClient is deprecated. Use the backend jeyProxy (services/jeyProxy.js) instead.');
}

export const openaiClient = null;
export const callWithRetry = _throwDeprecated;
