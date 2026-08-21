# Railway deployment

This repository contains separate Railway configurations for the API,
WhatsApp worker, and Next.js frontend. Create each Railway service from the
same repository and set its **Root Directory** as shown below so Railway picks
up the matching config file.

| Service | Root Directory | Config file | Start |
| --- | --- | --- | --- |
| API | `/backend` | `railway.json` | FastAPI on `$PORT` |
| WhatsApp worker | `/backend` | `railway.worker.json` | durable queue worker |
| Frontend | `/frontend` | `railway.json` | Next.js on `$PORT` |

For the worker service, set **Config File Path** to `backend/railway.worker.json`
if Railway does not resolve it relative to the selected root directory. The API
and frontend use the normal `railway.json` path for their respective root
 directories.

## Required variables

### API service

Set these as Railway variables (secret values must be entered in Railway, not
committed):

- `APP_ENV=production`
- `APP_VERSION=0.4.0`
- `LOG_LEVEL=INFO`
- `SUPABASE_URL` (HTTPS Supabase project URL)
- `SUPABASE_SERVICE_KEY`
- `PAGINATION_CURSOR_SECRET`
- `CORS_ORIGINS` with the public frontend URL
- `MEDIA_ALLOWED_HOSTS` when seller media proxying is enabled
- `GROQ_API_KEY` when AI classification is enabled
- `SENTRY_DSN` optionally

Keep `ENABLE_DEV_ENDPOINTS=false`, `WHATSAPP_RUNTIME_ENABLED=false`, and
`WHATSAPP_SEND_ENABLED=false` until the corresponding production integrations
and migrations have been verified. Add the WhatsApp webhook/send variables
from `backend/.env.example` only when enabling that integration.

### WhatsApp worker service

Use the same database and WhatsApp variables as the API. Set
`WHATSAPP_RUNTIME_ENABLED=true` only after migrations 036–041 are applied and
verified. Keep `WHATSAPP_SEND_ENABLED=false` unless outbound credentials and
`WHATSAPP_GRAPH_API_VERSION` are configured.

### Frontend service

Set the public variables below. The API and Supabase URLs must be HTTPS in
Railway:

- `NEXT_PUBLIC_API_BASE_URL=https://<api-domain>`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL=https://<frontend-domain>`

Generate a public Railway domain for each service (or add a custom domain),
then update `CORS_ORIGINS` and the frontend API URL with the final domains.
Railway provides `PORT`; do not hard-code it.

## Deploy checklist

1. Apply and verify the Supabase migration chain through migration 041.
2. Deploy the API and confirm `GET /health` returns HTTP 200.
3. Configure the frontend public variables and deploy it.
4. Replace the temporary domains in `CORS_ORIGINS` and
   `NEXT_PUBLIC_API_BASE_URL` with the final domains.
5. Deploy the worker separately and inspect its logs before enabling outbound
   WhatsApp sending.

The checked-in configs intentionally do not contain credentials or production
variable values.
