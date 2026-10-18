#!/usr/bin/env bash
# Builds the container and deploys Reels Studio to Cloud Run (Tokyo), with user data on a Cloud Storage bucket.
# First time: see deploy/README.md for the accounts and secrets this needs.
#   PROJECT_ID=my-project ./deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

: "${PROJECT_ID:?set PROJECT_ID}"
REGION="${REGION:-asia-northeast1}"
SERVICE="${SERVICE:-reels-studio}"
BUCKET="${BUCKET:-${PROJECT_ID}-reels-data}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/reels/${SERVICE}"

gcloud config set project "$PROJECT_ID" >/dev/null
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com storage.googleapis.com \
  fcm.googleapis.com identitytoolkit.googleapis.com >/dev/null

gcloud artifacts repositories describe reels --location "$REGION" >/dev/null 2>&1 ||
  gcloud artifacts repositories create reels --repository-format docker --location "$REGION"
gcloud storage buckets describe "gs://$BUCKET" >/dev/null 2>&1 ||
  gcloud storage buckets create "gs://$BUCKET" --location "$REGION" --uniform-bucket-level-access

# The service account the app runs as may read the secrets and use the bucket.
SA="$(gcloud projects describe "$PROJECT_ID" --format 'value(projectNumber)')-compute@developer.gserviceaccount.com"
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member "serviceAccount:$SA" --role roles/storage.objectAdmin >/dev/null
SECRETS="GEMINI_API_KEY=GEMINI_API_KEY:latest,STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest,STRIPE_WEBHOOK_SECRET=STRIPE_WEBHOOK_SECRET:latest"
# In-app purchases: only once the RevenueCat webhook secret exists (app/native/README.md).
if gcloud secrets describe REVENUECAT_WEBHOOK_AUTH >/dev/null 2>&1; then
  SECRETS="$SECRETS,REVENUECAT_WEBHOOK_AUTH=REVENUECAT_WEBHOOK_AUTH:latest"
fi
for s in $(echo "$SECRETS" | tr ',' '\n' | cut -d= -f1); do
  gcloud secrets add-iam-policy-binding "$s" --member "serviceAccount:$SA" --role roles/secretmanager.secretAccessor >/dev/null
done
# The app itself: deletes Firebase logins (account deletion) and sends pushes (export finished).
for r in roles/firebaseauth.admin roles/firebasecloudmessaging.admin; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member "serviceAccount:$SA" --role "$r" --condition None >/dev/null
done

gcloud builds submit --tag "$IMAGE" --machine-type e2-highcpu-8 --timeout 3600

# One always-on instance: jobs run in the background after the request returns, and accounts live in one file.
gcloud run deploy "$SERVICE" \
  --image "$IMAGE" --region "$REGION" --allow-unauthenticated \
  --execution-environment gen2 --cpu 4 --memory 8Gi --no-cpu-throttling \
  --min-instances 1 --max-instances 1 --concurrency 80 --timeout 3600 \
  --add-volume "name=data,type=cloud-storage,bucket=$BUCKET" --add-volume-mount "volume=data,mount-path=/data" \
  --set-secrets "$SECRETS" \
  --env-vars-file deploy/env.yaml

gcloud run services describe "$SERVICE" --region "$REGION" --format 'value(status.url)'
