To update the worker run:

If the region is not there ask AI for a gcloud command to get region

gcloud run deploy nexnote-worker \
  --source . \
  --region $REGION \
  --allow-unauthenticated \
  --no-cpu-throttling \
  --memory 1Gi \
  --timeout 3600 \
  --concurrency 10