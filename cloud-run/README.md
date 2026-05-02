To update the worker run:

Set defaults first:

```bash
PROJECT_ID="${PROJECT_ID:-nexnote-494219}"
SERVICE="${SERVICE:-nexnote-worker}"
REGION="${REGION:-us-central1}"
```

Deploy:

```bash
gcloud run deploy "$SERVICE" \
  --project "$PROJECT_ID" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --no-cpu-throttling \
  --memory 1Gi \
  --timeout 3600 \
  --concurrency 10
```

If using Secret Manager env vars (e.g. `APNS_PRIVATE_KEY`), ensure the runtime
service account can read the secret:

```bash
RUNTIME_SA="${RUNTIME_SA:-$(gcloud run services describe "$SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --format="value(spec.template.spec.serviceAccountName)")}"
```