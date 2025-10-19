/**
 * Script to programmatically create a Firestore composite index for the `ratingRequests` collection.
 *
 * Usage:
 *   node scripts/create_firestore_index.js
 *
 * Requirements:
 * - A service account JSON present at the repo root (file name referenced below).
 * - Network access and the service account must have the "Cloud Datastore Owner" or Firestore Admin permissions.
 *
 * NOTE: This uses the Firestore Admin REST API to create an index. It is intended for developer convenience
 * and should be run manually by a maintainer on a machine with the service account file.
 */

const { GoogleAuth } = require('google-auth-library');
const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT_PATH = path.resolve(__dirname, '..', 'elitereply-bd74d-firebase-adminsdk-fbsvc-2225bcc7f7.json');

async function main() {
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error('Service account file not found at', SERVICE_ACCOUNT_PATH);
    console.error('Place your service account JSON at that path and re-run the script.');
    process.exit(1);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
  const projectIdFromKey = serviceAccount.project_id;
  const projectId = process.env.FIREBASE_PROJECT_ID || projectIdFromKey;
  if (!projectId) {
    console.error('Could not determine project id from service account. Set FIREBASE_PROJECT_ID env or include it in the key file.');
    process.exit(1);
  }

  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/datastore']
  });

  const client = await auth.getClient();
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/indexes`;

  // Desired index definition (adjust fields/order as needed).
  const indexDefinition = {
    collectionId: 'ratingRequests',
    queryScope: 'COLLECTION',
    fields: [
      { fieldPath: 'clientId', order: 'ASCENDING' },
      { fieldPath: 'codeData', order: 'ASCENDING' },
      { fieldPath: 'partnerId', order: 'ASCENDING' },
      { fieldPath: 'status', order: 'ASCENDING' }
    ]
  };

  try {
    // Check existing indexes to avoid duplicates
    const listUrl = `${url}?pageSize=200`;
    const resList = await client.request({ url: listUrl });
    const existing = resList.data.indexes || [];

    const exists = existing.some(idx => {
      if (idx.collectionId !== indexDefinition.collectionId) return false;
      const idxFields = (idx.fields || []).map(f => `${f.fieldPath}:${f.order || f.arrayConfig || 'UNKNOWN'}`);
      const desiredFields = indexDefinition.fields.map(f => `${f.fieldPath}:${f.order}`);
      return desiredFields.every((df, i) => df === idxFields[i]);
    });

    if (exists) {
      console.log('Index already exists for ratingRequests — nothing to do.');
      process.exit(0);
    }

    console.log('Creating index for ratingRequests...');
    const res = await client.request({
      method: 'POST',
      url,
      data: indexDefinition
    });

    console.log('Index create request sent. Response:');
    console.log(res.data);
    console.log('Index is being built by Firestore — it may take a few minutes to be ready.');
  } catch (err) {
    console.error('Failed to create index:', err.message || err);
    if (err.response && err.response.data) {
      console.error('API response:', JSON.stringify(err.response.data, null, 2));
    }
    process.exit(1);
  }
}

main();
