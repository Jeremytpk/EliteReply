// jeyProxy.js (Full updated file)

import { getIdToken } from 'firebase/auth';
import { auth } from '../firebase';
// NOTE: Assuming firebase is imported correctly in the function environment,
// though this file is primarily client-side code from your original setup.

const FUNCTIONS_BASE_URL = process.env.FUNCTIONS_BASE_URL || 'https://us-central1-elitereply-bd74d.cloudfunctions.net';

export async function callJeyProxy(messages, { systemPrompt, max_tokens = 250, temperature = 0.7 } = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');
  const idToken = await getIdToken(user, true);

  // === TEMPORARY CODE CHANGE TO FORCE REDEPLOY OF THE CLOUD FUNCTION ===
  // THIS LOG IS ADDED TO ENSURE FIREBASE DETECTS A CHANGE AND RELOADS THE CONFIG
  console.log('JeyProxy client is preparing the authenticated request.'); 
  // =====================================================================

  const resp = await fetch(`${FUNCTIONS_BASE_URL}/jeyProxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify({ messages, systemPrompt, max_tokens, temperature })
  });

    if (!resp.ok) {
      let errBody = null;
      try {
        errBody = await resp.json();
      } catch (e) {
        // ignore
      }
      const err = new Error(`jeyProxy error: ${resp.status} ${errBody && (errBody.error || errBody.details ? '- ' + (errBody.error || errBody.details) : '')}`);
      err.status = resp.status;
      if (errBody) {
        // preserve server-side details for easier debugging
        err.details = errBody.details || errBody.error || JSON.stringify(errBody);
        err.code = errBody.code || null;
      }
      throw err;
  }

  const data = await resp.json();
  return data;
}

export default callJeyProxy;