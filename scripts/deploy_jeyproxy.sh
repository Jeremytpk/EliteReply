#!/usr/bin/env bash
set -euo pipefail

# Deploy jeyProxy to Cloud Functions (gen2) with Secret Manager mapping
# Usage:
#   ./scripts/deploy_jeyproxy.sh --project PROJECT_ID --region REGION --secret-name OPENAI_API_KEY --openai-key-file /path/to/keyfile
# OR
#   export OPENAI_KEY && ./scripts/deploy_jeyproxy.sh --project PROJECT_ID --region REGION --secret-name OPENAI_API_KEY

print_usage() {
  cat <<EOF
Usage: $0 --project PROJECT_ID --region REGION --secret-name SECRET_ID [--openai-key-file FILE] [--service-account SA]

This script will:
  - create Secret Manager secret (if missing)
  - add a new version containing the OpenAI key
  - grant secret accessor role to the function service account
  - deploy the gen2 Cloud Function 'jeyProxy' mapping the secret to process.env.OPENAI_API_KEY

Environment:
  OPENAI_KEY (optional) - if set, used as the secret value

EOF
}

# defaults
SERVICE_ACCOUNT=""
SECRET_NAME="OPENAI_API_KEY"
PROJECT_ID=""
REGION="us-central1"
OPENAI_KEY_FILE=""

# parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --project) PROJECT_ID="$2"; shift 2;;
    --region) REGION="$2"; shift 2;;
    --secret-name) SECRET_NAME="$2"; shift 2;;
    --openai-key-file) OPENAI_KEY_FILE="$2"; shift 2;;
    --service-account) SERVICE_ACCOUNT="$2"; shift 2;;
    --help) print_usage; exit 0;;
    *) echo "Unknown arg: $1"; print_usage; exit 1;;
  esac
done

if [[ -z "$PROJECT_ID" ]]; then
  echo "ERROR: --project is required" >&2
  print_usage
  exit 1
fi

if [[ -z "$OPENAI_KEY_FILE" && -z "${OPENAI_KEY:-}" ]]; then
  echo "ERROR: Provide OPENAI_KEY environment variable or --openai-key-file path" >&2
  print_usage
  exit 1
fi

# Read key
if [[ -n "$OPENAI_KEY_FILE" ]]; then
  OPENAI_KEY=$(cat "$OPENAI_KEY_FILE")
fi

# Ensure Secret Manager API is enabled
echo "Ensuring Secret Manager API is enabled for project $PROJECT_ID..."
gcloud services enable secretmanager.googleapis.com --project="$PROJECT_ID"

# Create secret if not exists
if ! gcloud secrets describe "$SECRET_NAME" --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "Creating secret $SECRET_NAME..."
  gcloud secrets create "$SECRET_NAME" --project="$PROJECT_ID" --replication-policy="automatic"
else
  echo "Secret $SECRET_NAME already exists"
fi

# Add a version
echo "Adding secret version to $SECRET_NAME..."
printf "%s" "$OPENAI_KEY" | gcloud secrets versions add "$SECRET_NAME" --data-file=- --project="$PROJECT_ID"

# Determine service account
if [[ -z "$SERVICE_ACCOUNT" ]]; then
  # common Firebase Functions SA
  SERVICE_ACCOUNT="${PROJECT_ID}@appspot.gserviceaccount.com"
  echo "Using default service account: $SERVICE_ACCOUNT"
fi

# Grant secret accessor role
echo "Granting secretmanager.secretAccessor to $SERVICE_ACCOUNT..."
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SERVICE_ACCOUNT}" --role="roles/secretmanager.secretAccessor" || true

# Deploy the function
FUNCTION_NAME="jeyProxy"
ENTRY_POINT="jeyProxy"

echo "Deploying Cloud Function ${FUNCTION_NAME} (gen2) in ${REGION}..."
gcloud functions deploy "$FUNCTION_NAME" \
  --gen2 --region="$REGION" --project="$PROJECT_ID" \
  --runtime=nodejs22 --entry-point="$ENTRY_POINT" --trigger-http --allow-unauthenticated=false \
  --source="./functions" --set-secrets="${SECRET_NAME}=projects/${PROJECT_ID}/secrets/${SECRET_NAME}:latest"

# Describe the function and print URL
echo "Deployment complete. Function description:"
gcloud functions describe "$FUNCTION_NAME" --gen2 --region="$REGION" --project="$PROJECT_ID" --format="json(serviceConfig,httpsTrigger)" | jq .

echo "Done. Use the httpsTrigger.url above to call your function. Ensure you pass a valid Firebase ID token in Authorization header."
