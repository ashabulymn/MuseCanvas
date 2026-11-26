# MuseCanvas

**Multi-model image generation creation platform**

MuseCanvas is a creation platform for many image generation models. The platform brings together user creation, model configuration, supplier credentials, prompt preprocessing, task queues, and work history in a single workflow. The backend handles authentication, credential encryption, task persistence, and asynchronous processing; the frontend only uses interface data that has already been security-filtered.

> English-translation fork of [nextroad-dev/MuseCanvas](https://github.com/nextroad-dev/MuseCanvas) (upstream commit `a1ad6d8`). Logic unchanged — only text/documentation translated. The upstream Mandarin file is still kept as `readme.md`.

## Current capabilities

- Email OTP login, invitation-based registration, GitHub / Google OAuth login, and binding/unbinding third-party accounts.
- User creation desk, generation task progress, history, and result details.
- Admin panel: user management, OAuth Provider configuration, model management, supplier credential management, and task viewing.
- Multi-supplier image generation adapters; supplier API Key, Base URL, and model protocol are configured via the admin panel, and sensitive fields are write-only — they cannot be read back.
- LLM-based prompt preprocessing templates, read at runtime by the API / Worker from an external template index.
- PostgreSQL for core data persistence, Redis for queue status, rate limiting, and temporary cache, S3-compatible object storage for storing generation results.
- Docker Compose for running the full stack locally, GHCR image deployment, and a GitHub Actions image build pipeline.

## Technologies

- Frontend: Next.js 15 (App Router, React 19), Zustand, TanStack Query, Tailwind CSS, mixed rendering of SSR guard + Client Islands.
- API: Next.js API Routes, TypeScript, PostgreSQL, Redis.
- Worker: standalone TypeScript process, consuming the generation queue and background tasks.
- Infrastructure: Docker Compose, Nginx, GitHub Actions, GitHub Container Registry, S3-compatible object storage.

## Directory structure

```text
apps/
  web-next/  Next.js 15 frontend app (React 19)
  api/       API app (Next.js)
  worker/    Background task worker
packages/
  config/    Server-side environment variable reading and validation
  contracts/ DTOs, shared types, and browser-safe error codes
  database/  Migrations, transactions, and data access
  domain/    Business rules and state machines independent of any framework
  providers/ Image/video generation plugins and credential encryption (the object storage client lives in apps/worker, SMTP lives in apps/api)
docs/        Feature designs, implementation notes, and design system
deploy/      Compose orchestration, Dockerfiles, and Nginx configuration
scripts/     Local and deploy helper scripts
.github/     GitHub Actions workflows
```

## Plugin development guide

The development specification for model supplier plugins (image / video) is maintained separately in the [MuseCanvas-Connector](https://github.com/nextroad-dev/MuseCanvas-Connector) repo; the main repo no longer keeps a copy of `wiki/`:

- [Media plugin specification](https://github.com/nextroad-dev/MuseCanvas-Connector/blob/main/wiki/video-plugin-spec.md): core media provider contract, plugin lifecycle and state machine, output contract, security boundaries, error model, parameter validation, and testing gates.
- [Specification index and scope](https://github.com/nextroad-dev/MuseCanvas-Connector/blob/main/wiki/README.md): repo overview and reference implementation guide.

Before changing `packages/providers/src/core/` or `packages/providers/src/plugins/*`, read those specifications first; changes that violate the contract gates (`tests/integration/media-provider-contract.test.ts`) will not be merged.

## Docker / Compose files explained

| File | Purpose |
| --- | --- |
| `deploy/compose.yaml` | Default local full-stack environment, builds from source for `api`, `worker`, `web-next`, `nginx`, plus PostgreSQL, Redis, MinIO, Mailpit; on first run, the built-in default Mailpit / MinIO values are automatically written to the database (already configured, not yet verified), and the setup guide page is pre-filled. |
| `deploy/compose.dev.yaml` | Entry point for the dev environment, used with the explicit command `docker compose --project-directory . --env-file .env -f deploy/compose.dev.yaml`, also for local development. |
| `deploy/compose.prod.yaml` | Template for deploying from source, does NOT include MinIO / Mailpit, does NOT provide any default SMTP / S3 values; all application configuration is done via the `/setup` guide page and written to the database. |
| `deploy/compose.images.yaml` | Deployment using pre-built GHCR images, does NOT include MinIO / Mailpit, by default exposes Nginx via `18080:80`, and application configuration is likewise not pre-filled. |
| `deploy/docker/*.Dockerfile` | Definitions of the four images: `api`, `worker`, `web-next`, `nginx`. |

> MinIO and Mailpit are for local development only, to simulate object storage and email delivery. For public or production deployments, do NOT use the built-in MinIO / Mailpit; connect a compatible S3 and a real SMTP service on the `/setup` guide page.

## Running locally

1. Install dependencies:

```bash
corepack enable
pnpm install
```

2. Run the complete local environment (on first run, bootstrap keys and random passwords are generated automatically):

```bash
pnpm compose:up
```

Equivalent to automatically creating/completing `.env` (only `POSTGRES_PASSWORD`, `APP_MASTER_KEY`, `MINIO_ROOT_*`; existing values are never changed) → `docker compose --project-directory . --env-file .env -f deploy/compose.yaml up --build -d`.

3. Open `http://localhost:8080`; the browser automatically enters the **initialization setup guide page**:

- Set the admin email (the OTP code is sent to Mailpit: `http://localhost:8025`)
- SMTP and object storage are already pre-filled with the default Mailpit / MinIO values; click "Test connection" to verify
- Optional: configure supplier credentials, models, and OAuth login
- Once the guide is complete, you can start creating right away

4. Other services:

| Service | Address | Purpose |
| --- | --- | --- |
| Web | `http://localhost:8080` | Frontend app |
| Mailpit | `http://localhost:8025` | Email catcher (verification codes) |
| MinIO API | `http://localhost:9000` | Object storage |
| MinIO Console | `http://localhost:9001` | Object storage management console |

> `.env` only contains bootstrap keys and deploy switches: `POSTGRES_PASSWORD`, `APP_MASTER_KEY`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, and the `ALLOW_INSECURE_*` switches, all defaulting to `false` (the built-in Compose already allows plaintext SMTP for Mailpit). SMTP, application S3 configuration, public address, OAuth, upload limits, and prompt templates are all database configuration, filled in and tested on the setup guide page, no longer via environment variables. Legacy keys still in their transition period (`SESSION_SECRET`, `OAUTH_CREDENTIALS_ENCRYPTION_KEY`, `PROVIDER_CREDENTIALS_ENCRYPTION_KEY`) can still be passed to containers as read-only compatibility; new installations do not need to fill them in.

Stopping the local environment:

```bash
pnpm compose:down
```

## Deploy environment requirements

`deploy/compose.prod.yaml` and `deploy/compose.images.yaml` do not include S3 or email services, and do not provide any default values in the database. Before deploying, just prepare the bootstrap keys and deploy switches:

```bash
POSTGRES_PASSWORD=
APP_MASTER_KEY=   # 32 bytes, 64 hex characters or base64/base64url

# Security switches, default-deny (relax if needed, defaults stay false)
ALLOW_INSECURE_SMTP=false
ALLOW_INSECURE_PROVIDER_BASE_URL=false
ALLOW_PRIVATE_PROVIDER_BASE_URL=false
# Admins upload provider plugin code packages; when enabled, uploaded .mjs files
# will be executed with worker process privileges (can read all supplier credentials
# derived from APP_MASTER_KEY), only for mutually trusted admins.
ALLOW_PLUGIN_UPLOAD=false
# Local worker cache directory for materialized plugin artifacts, must be a
# writable temporary directory, do not place it under /app (temporary image layer).
PLUGIN_CACHE_DIR=/tmp/musecanvas-plugin-cache

# Read-only transition-period compatibility (optional, single version only): legacy keys can
# still be used, legacy encrypted data can still be read, all new writes use only
# keys derived from APP_MASTER_KEY. New installations leave these empty.
# SESSION_SECRET=
# OAUTH_CREDENTIALS_ENCRYPTION_KEY=
# PROVIDER_CREDENTIALS_ENCRYPTION_KEY=
```

Other application configuration (sender SMTP, S3-compatible object storage, public address, OAuth login, upload limits, prompt templates) is filled in on the `/setup` guide page when first opened, then click "Test connection" to verify; it is written to the database encrypted, no longer via environment variables.

> Upgrade note: leftover legacy keys in `.env` (`SESSION_SECRET`, `*_ENCRYPTION_KEY`, `SMTP_*`, `S3_*`, `ADMIN_EMAIL`, `PROMPT_TEMPLATE_*`, etc.) will be ignored by the new Compose (no longer required, no longer an error), `generate-env` only completes missing `APP_MASTER_KEY` / `MINIO_ROOT_*` values and never changes existing values. Admins and configuration already written to the database are unaffected.

All keys may only be placed in server-side environment variables or encrypted admin configuration; they must never be written into frontend code.

### External S3 bucket CORS requirements

So the frontend browser can upload reference images directly via Presigned POST, an external S3 / Cloudflare R2 / MinIO bucket must be configured with CORS rules:

- **AllowedOrigins**: the origin where the frontend is deployed, e.g. `https://studio.example.com` (for local development using an external bucket, use `http://localhost:8080`, etc.).
- **AllowedMethods**: `POST`, `GET`, `HEAD` (direct upload via a presigned form requires `POST` to be allowed).
- **AllowedHeaders**: `*` (covers all headers carried by the upload form).
- **ExposeHeaders**: `ETag`, `Location`.
- **MaxAgeSeconds**: `3600`.

Example JSON configuration for an AWS S3 / compatible bucket:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["POST", "GET", "HEAD"],
    "AllowedOrigins": ["https://studio.example.com"],
    "ExposeHeaders": ["ETag", "Location"],
    "MaxAgeSeconds": 3600
  }
]
```

Example XML configuration for MinIO / S3:

```xml
<CORSConfiguration>
  <CORSRule>
    <AllowedOrigin>https://studio.example.com</AllowedOrigin>
    <AllowedMethod>POST</AllowedMethod>
    <AllowedMethod>GET</AllowedMethod>
    <AllowedMethod>HEAD</AllowedMethod>
    <AllowedHeader>*</AllowedHeader>
    <ExposeHeader>ETag</ExposeHeader>
    <ExposeHeader>Location</ExposeHeader>
    <MaxAgeSeconds>3600</MaxAgeSeconds>
  </CORSRule>
</CORSConfiguration>
```

## Deploying with GHCR images

Every push to the `main` branch, `.github/workflows/docker-image.yml` builds and publishes four images:

```text
ghcr.io/nextroad-dev/musecanvas-api:latest
ghcr.io/nextroad-dev/musecanvas-worker:latest
ghcr.io/nextroad-dev/musecanvas-web-next:latest
ghcr.io/nextroad-dev/musecanvas-nginx:latest
```

A deploy machine can use `deploy/compose.images.yaml`:

```bash
docker compose --project-directory . --env-file .env -f deploy/compose.images.yaml pull
docker compose --project-directory . --env-file .env -f deploy/compose.images.yaml up -d
```

Optional variables:

```bash
MUSECANVAS_IMAGE_TAG=latest
MUSECANVAS_HTTP_PORT=18080
```

If the GHCR package is not yet public, log in on the server first:

```bash
echo GITHUB_TOKEN | docker login ghcr.io -u nextroad-dev --password-stdin
```

> ⚠️ **Dokploy LABS (ARM64): do NOT use this image path.** The upstream workflow does not set `platforms:`, so the GHCR images are only built for `amd64`. On an ARM64 host, use the build-from-source path below (`deploy/compose.prod.yaml`). See `DOKPLOY.md`.

## Deploying from source (self-build)

If the deploy machine needs to build images directly from the repo source, use:

```bash
docker compose --project-directory . --env-file .env -f deploy/compose.prod.yaml up --build -d
```

This path also only needs the bootstrap keys (see above), while SMTP / S3 / domain / OAuth are configured on the `/setup` guide page. `deploy/compose.prod.yaml` only orchestrates the app, Nginx, PostgreSQL, and Redis; MinIO or Mailpit are not run.

## Commonly used commands

```bash
pnpm dev                  # Run dev services in apps in parallel
pnpm build                # Recursive build
pnpm lint                 # Run recursive lint
pnpm typecheck            # Recursive type check
pnpm test                 # Run recursive tests
pnpm test:e2e:admin       # Admin panel end-to-end verification script
pnpm compose:up
pnpm compose:down
```

> `scripts/prepare-prompt-templates.mjs` (`pnpm prepare:prompt-templates`) is only a manual compatibility entry point for old deployments that still mount an external template directory; it is no longer run automatically by `compose:up` or any Compose file; the runtime source of templates is the versioned template collection written to the database via the setup guide page.

Running a single app only:

```bash
pnpm --filter @musecanvas/web-next dev
pnpm --filter @musecanvas/api dev
pnpm --filter @musecanvas/worker dev
```

## Verification before commit

Depending on the scope of the change, run at least the relevant commands:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
docker compose --project-directory . --env-file .env -f deploy/compose.yaml ps
```

For visual appearance, interaction, or frontend component changes, first consult `docs/design-system.md`. For features that have a `docs/{number}-{feature-name}/design.md`, the `impl.md` and `result.md` files in the same directory are also deliverables.
