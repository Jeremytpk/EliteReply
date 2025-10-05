// OpenAIConfig.js
// This file is in the root of your project.

// !! IMPORTANT SECURITY WARNING !!
// Storing API keys directly in client-side code (even in a separate file)
// is NOT secure for production applications. Anyone can inspect your app's
// bundled JavaScript and extract this key.
//
// For production, you MUST use a secure backend (like Firebase Cloud Functions,
// a Node.js/Express server, etc.) to proxy your requests to OpenAI,
// keeping your API key stored securely on the server.

export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'PLACEHOLDER_OPENAI_KEY'; 