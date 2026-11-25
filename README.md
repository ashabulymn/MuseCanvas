# MuseCanvas

**Platforma kreasi multi-model gambar (image generation)**

MuseCanvas adalah platform kreasi untuk banyak model image generation. Platform ini menyatukan kreasi pengguna, konfigurasi model, kredensial supplier, preprocessing prompt, antrean tugas, dan riwayat karya dalam satu alur kerja. Backend mengurus autentikasi, enkripsi kredensial, persistensi tugas, dan pemrosesan asinkron; frontend hanya memakai data antarmuka yang sudah difilter keamanannya.

> Fork terjemahan Bahasa Indonesia dari [nextroad-dev/MuseCanvas](https://github.com/nextroad-dev/MuseCanvas) (commit upstream `a1ad6d8`). Logika tidak diubah — hanya teks/dokumentasi yang diterjemahkan. File upstream berbahasa Mandarin masih tersimpan sebagai `readme.md`.

## Kemampuan saat ini

- Login OTP email, pendaftaran undangan, login GitHub / Google OAuth, serta binding/unbinding akun pihak ketiga.
- Meja kreasi pengguna, progres tugas generate, riwayat, dan detail hasil.
- Admin panel: manajemen pengguna, konfigurasi OAuth Provider, manajemen model, manajemen kredensial supplier, dan melihat tugas.
- Adapter multi-supplier image generation; API Key supplier, Base URL, dan protokol model dikonfigurasi lewat admin panel, field sensitif hanya bisa ditulis, tidak bisa dibaca kembali.
- Template preprocessing prompt berbasis LLM, dibaca saat runtime oleh API / Worker dari indeks template eksternal.
- PostgreSQL untuk persistensi data inti, Redis untuk status antrean, rate limit, dan cache sementara, object storage yang kompatibel S3 untuk menyimpan hasil generate.
- Docker Compose untuk menjalankan full-stack secara lokal, deploy image GHCR, dan pipeline build image GitHub Actions.

## Teknologi

- Frontend: Next.js 15 (App Router, React 19), Zustand, TanStack Query, Tailwind CSS, rendering campuran SSR guard + Client Islands.
- API: Next.js API Routes, TypeScript, PostgreSQL, Redis.
- Worker: proses TypeScript mandiri, mengonsumsi antrean generate dan tugas latar.
- Infrastruktur: Docker Compose, Nginx, GitHub Actions, GitHub Container Registry, object storage kompatibel S3.

## Struktur direktori

```text
apps/
  web-next/  Aplikasi frontend Next.js 15 (React 19)
  api/       Aplikasi API Next.js
  worker/    Worker tugas latar
packages/
  config/    Pembacaan dan validasi environment variable sisi server
  contracts/ DTO, tipe bersama, dan kode error yang aman dipakai browser
  database/  Migration, transaksi, dan akses data
  domain/    Aturan bisnis dan state machine yang tidak bergantung framework
  providers/ Plugin image/video generation dan enkripsi kredensial (client object storage ada di apps/worker, SMTP ada di apps/api)
docs/        Desain fitur, catatan implementasi, dan design system
deploy/      Orkestrasi Compose, Dockerfile, dan konfigurasi Nginx
scripts/     Script bantuan lokal dan deploy
.github/     Workflow GitHub Actions
```

## Panduan pengembangan plugin

Spesifikasi pengembangan plugin supplier model (gambar / video) dikelola terpisah di repo [MuseCanvas-Connector](https://github.com/nextroad-dev/MuseCanvas-Connector), repo utama tidak lagi menyimpan salinan `wiki/`:

- [Spesifikasi plugin media](https://github.com/nextroad-dev/MuseCanvas-Connector/blob/main/wiki/video-plugin-spec.md): kontrak inti media provider, lifecycle plugin dan state machine, kontrak output, batas keamanan, model error, validasi parameter, dan gerbang pengujian.
- [Indeks spesifikasi dan ruang lingkup](https://github.com/nextroad-dev/MuseCanvas-Connector/blob/main/wiki/README.md): penjelasan repo dan panduan implementasi referensi.

Sebelum mengubah `packages/providers/src/core/` atau `packages/providers/src/plugins/*`, baca dulu spesifikasi tersebut; perubahan yang melanggar gerbang kontrak (`tests/integration/media-provider-contract.test.ts`) tidak akan digabung.

## Penjelasan file Docker / Compose

| File | Kegunaan |
| --- | --- |
| `deploy/compose.yaml` | Lingkungan full-stack lokal default, build dari source untuk `api`, `worker`, `web-next`, `nginx`, plus PostgreSQL, Redis, MinIO, Mailpit; saat pertama jalan, nilai default Mailpit / MinIO bawaan otomatis ditulis ke database (sudah terkonfigurasi, belum terverifikasi), halaman panduan langsung terisi. |
| `deploy/compose.dev.yaml` | Pintu masuk lingkungan dev, dipakai dengan perintah eksplisit `docker compose --project-directory . --env-file .env -f deploy/compose.dev.yaml`, juga untuk pengembangan lokal. |
| `deploy/compose.prod.yaml` | Template deploy dari source, TIDAK berisi MinIO / Mailpit, TIDAK memberi nilai default SMTP / S3 apa pun, semua konfigurasi aplikasi lewat halaman panduan `/setup` dan ditulis ke database. |
| `deploy/compose.images.yaml` | Deploy memakai image GHCR yang sudah di-build, TIDAK berisi MinIO / Mailpit, default mengekspos Nginx lewat `18080:80`, konfigurasi aplikasi juga sama-sama tidak terisi. |
| `deploy/docker/*.Dockerfile` | Definisi empat image: `api`, `worker`, `web-next`, `nginx`. |

> MinIO dan Mailpit hanya untuk pengembangan lokal, untuk simulasi object storage dan pengiriman email. Deploy publik atau produksi JANGAN memakai MinIO / Mailpit bawaan; sambungkan S3 yang kompatibel dan layanan SMTP asli di halaman panduan `/setup`.

## Menjalankan secara lokal

1. Instal dependensi:

```bash
corepack enable
pnpm install
```

2. Jalankan lingkungan lokal lengkap (saat pertama jalan, bootstrap key dan password acak dibuat otomatis):

```bash
pnpm compose:up
```

Setara dengan membuat/melengkapi `.env` otomatis (hanya `POSTGRES_PASSWORD`, `APP_MASTER_KEY`, `MINIO_ROOT_*`, nilai yang sudah ada tidak pernah diubah) → `docker compose --project-directory . --env-file .env -f deploy/compose.yaml up --build -d`.

3. Buka `http://localhost:8080`, browser otomatis masuk ke **halaman panduan inisialisasi**:

- Atur email admin (kode OTP dikirim ke Mailpit: `http://localhost:8025`)
- SMTP dan object storage sudah terisi nilai bawaan Mailpit / MinIO, klik "Tes koneksi" untuk verifikasi
- Opsional: konfigurasi kredensial supplier, model, dan login OAuth
- Setelah panduan selesai, langsung bisa berkarya

4. Layanan lain:

| Layanan | Alamat | Kegunaan |
| --- | --- | --- |
| Web | `http://localhost:8080` | Aplikasi frontend |
| Mailpit | `http://localhost:8025` | Penangkap email (kode verifikasi) |
| MinIO API | `http://localhost:9000` | Object storage |
| MinIO Console | `http://localhost:9001` | Konsol manajemen object storage |

> `.env` hanya berisi bootstrap key dan saklar deploy: `POSTGRES_PASSWORD`, `APP_MASTER_KEY`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, serta saklar `ALLOW_INSECURE_*` yang defaultnya semua `false` (Compose bawaan sudah mengizinkan SMTP plaintext untuk Mailpit). SMTP, konfigurasi S3 aplikasi, alamat publik, OAuth, batas upload, dan template prompt semuanya konfigurasi database, diisi dan dites di halaman panduan, tidak lagi lewat environment variable. Key lama yang masih dalam masa transisi (`SESSION_SECRET`, `OAUTH_CREDENTIALS_ENCRYPTION_KEY`, `PROVIDER_CREDENTIALS_ENCRYPTION_KEY`) masih bisa dikirim ke container sebagai kompatibilitas read-only; instalasi baru tidak perlu mengisinya.

Menghentikan lingkungan lokal:

```bash
pnpm compose:down
```

## Persyaratan lingkungan deploy

`deploy/compose.prod.yaml` dan `deploy/compose.images.yaml` tidak menyertakan S3 atau layanan email, dan tidak memberi nilai default apa pun di database. Sebelum deploy, siapkan saja bootstrap key dan saklar deploy:

```bash
POSTGRES_PASSWORD=
APP_MASTER_KEY=   # 32 byte, 64 karakter hex atau base64/base64url

# Saklar keamanan default-ditolak (longgarkan bila perlu, default tetap false)
ALLOW_INSECURE_SMTP=false
ALLOW_INSECURE_PROVIDER_BASE_URL=false
ALLOW_PRIVATE_PROVIDER_BASE_URL=false
# Admin mengunggah paket kode plugin provider; bila diaktifkan, file .mjs yang diunggah
# akan dieksekusi dengan hak proses worker (bisa membaca semua kredensial supplier
# turunan APP_MASTER_KEY), hanya untuk admin yang saling dipercaya.
ALLOW_PLUGIN_UPLOAD=false
# Direktori cache lokal worker untuk artefak plugin yang dimaterialisasi, harus
# direktori sementara yang bisa ditulis, jangan taruh di /app (layer image sementara).
PLUGIN_CACHE_DIR=/tmp/musecanvas-plugin-cache

# Kompatibilitas read-only masa transisi (opsional, hanya satu versi): key lama masih
# bisa dipakai, data terenkripsi lama tetap bisa dibaca, semua penulisan baru hanya
# memakai key turunan APP_MASTER_KEY. Instalasi baru biarkan kosong.
# SESSION_SECRET=
# OAUTH_CREDENTIALS_ENCRYPTION_KEY=
# PROVIDER_CREDENTIALS_ENCRYPTION_KEY=
```

Konfigurasi aplikasi lainnya (SMTP pengirim, object storage kompatibel S3, alamat publik, login OAuth, batas upload, template prompt) diisi di halaman panduan `/setup` saat pertama dibuka, lalu klik "Tes koneksi" untuk verifikasi, ditulis ke database secara terenkripsi, tidak lagi lewat environment variable.

> Catatan upgrade: sisa key lama di `.env` (`SESSION_SECRET`, `*_ENCRYPTION_KEY`, `SMTP_*`, `S3_*`, `ADMIN_EMAIL`, `PROMPT_TEMPLATE_*`, dll) akan diabaikan oleh Compose baru (tidak lagi wajib, tidak lagi error), `generate-env` hanya melengkapi `APP_MASTER_KEY` / `MINIO_ROOT_*` yang hilang, tidak pernah mengubah nilai yang ada. Admin dan konfigurasi yang sudah tertulis di database tidak terpengaruh.

Semua key hanya boleh ditaruh di environment variable sisi server atau konfigurasi admin yang terenkripsi, dilarang ditulis ke kode frontend.

### Persyaratan CORS bucket S3 eksternal

Agar browser frontend bisa langsung mengunggah gambar referensi lewat Presigned POST, bucket S3 / Cloudflare R2 / MinIO eksternal harus mengonfigurasi aturan CORS:

- **AllowedOrigins**: origin tempat frontend di-deploy, misalnya `https://studio.example.com` (untuk pengembangan lokal yang memakai bucket eksternal, pakai `http://localhost:8080`, dll).
- **AllowedMethods**: `POST`, `GET`, `HEAD` (upload langsung lewat form presigned wajib mengizinkan `POST`).
- **AllowedHeaders**: `*` (mencakup semua header yang dibawa form upload).
- **ExposeHeaders**: `ETag`, `Location`.
- **MaxAgeSeconds**: `3600`.

Contoh konfigurasi JSON bucket AWS S3 / yang kompatibel:

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

Contoh konfigurasi XML MinIO / S3:

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

## Deploy memakai image GHCR

Setiap push ke branch `main`, `.github/workflows/docker-image.yml` akan mem-build dan memublikasikan empat image:

```text
ghcr.io/nextroad-dev/musecanvas-api:latest
ghcr.io/nextroad-dev/musecanvas-worker:latest
ghcr.io/nextroad-dev/musecanvas-web-next:latest
ghcr.io/nextroad-dev/musecanvas-nginx:latest
```

Mesin deploy bisa memakai `deploy/compose.images.yaml`:

```bash
docker compose --project-directory . --env-file .env -f deploy/compose.images.yaml pull
docker compose --project-directory . --env-file .env -f deploy/compose.images.yaml up -d
```

Variabel opsional:

```bash
MUSECANVAS_IMAGE_TAG=latest
MUSECANVAS_HTTP_PORT=18080
```

Jika Package GHCR belum bersifat publik, login dulu di server:

```bash
echo GITHUB_TOKEN | docker login ghcr.io -u nextroad-dev --password-stdin
```

> ⚠️ **Dokploy LABS (ARM64): JANGAN pakai jalur image ini.** Workflow upstream tidak mengatur `platforms:`, jadi image GHCR hanya di-build untuk `amd64`. Di host ARM64, pakai jalur build dari source di bawah (`deploy/compose.prod.yaml`). Lihat `DOKPLOY.md`.

## Deploy dari source (build sendiri)

Jika mesin deploy perlu mem-build image langsung dari source repo, pakai:

```bash
docker compose --project-directory . --env-file .env -f deploy/compose.prod.yaml up --build -d
```

Jalur ini juga hanya membutuhkan bootstrap key (lihat atas), sedangkan SMTP / S3 / domain / OAuth dikonfigurasi di halaman panduan `/setup`. `deploy/compose.prod.yaml` hanya mengatur orkestrasi aplikasi, Nginx, PostgreSQL, dan Redis; MinIO atau Mailpit tidak dijalankan.

## Perintah yang sering dipakai

```bash
pnpm dev                  # Menjalankan layanan dev di apps secara paralel
pnpm build                # Build rekursif
pnpm lint                 # Menjalankan lint rekursif
pnpm typecheck            # Pemeriksaan tipe rekursif
pnpm test                 # Menjalankan test rekursif
pnpm test:e2e:admin       # Script verifikasi end-to-end admin panel
pnpm compose:up
pnpm compose:down
```

> `scripts/prepare-prompt-templates.mjs` (`pnpm prepare:prompt-templates`) hanya pintu masuk kompatibilitas manual untuk deploy lama yang masih me-mount direktori template eksternal; tidak lagi dijalankan otomatis oleh `compose:up` atau file Compose mana pun; sumber runtime template adalah kumpulan template berversi yang ditulis lewat halaman panduan ke database.

Menjalankan satu aplikasi saja:

```bash
pnpm --filter @musecanvas/web-next dev
pnpm --filter @musecanvas/api dev
pnpm --filter @musecanvas/worker dev
```

## Verifikasi sebelum commit

Sesuai cakupan perubahan, jalankan minimal perintah terkait:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
docker compose --project-directory . --env-file .env -f deploy/compose.yaml ps
```

Untuk perubahan tampilan visual, interaksi, atau komponen frontend, lihat dulu `docs/design-system.md`. Untuk fitur yang punya `docs/{nomor}-{nama-fitur}/design.md`, file `impl.md` dan `result.md` di direktori yang sama juga termasuk deliverable.
