# Deploy MuseCanvas ke Dokploy

Fork terjemahan Bahasa Indonesia dari [nextroad-dev/MuseCanvas](https://github.com/nextroad-dev/MuseCanvas)
(upstream commit `a1ad6d8`, 91 commit). Repo fork: [ashabulymn/MuseCanvas](https://github.com/ashabulymn/MuseCanvas).

> MuseCanvas ini **bukan** Muse-Canvas (huwanbin) yang sudah live di
> `muse-canvas.masyamin.biz.id`. Ini studio AI art multi-model yang jauh lebih
> berat: Next.js 15 + API + Worker + Nginx + PostgreSQL + Redis, dan wajib
> punya S3 + SMTP sebelum bisa dipakai penuh.

## 1. Jenis aplikasi Dokploy

- **Tipe: Compose** (bukan Dockerfile tunggal, bukan Nixpacks).
- **Repo:** `ashabulymn/MuseCanvas`, branch `main`.
- **File Compose: `compose.dokploy.yaml` (di root repo)** — salinan persis
  `deploy/compose.prod.yaml` (hanya header komentar yang ditambah), build
  dari source.
- **WAJIB pakai `compose.dokploy.yaml`, JANGAN `deploy/compose.prod.yaml`:**
  deploy pertama (commit `7dd08bb`) memakai `deploy/compose.prod.yaml` dan
  gagal deterministik sebelum build mulai:
  `resolve : lstat /etc/dokploy/compose/labs-musecanvas-7lp4dk/code/deploy/deploy: no such file or directory`.
  Penyebab: `compose.prod.yaml` memakai build context `"."` + dockerfile
  `deploy/docker/*.Dockerfile`, yang hanya jalan bila project directory =
  root repo (seperti perintah lokal upstream yang memakai
  `--project-directory .`). Dokploy TIDAK memakai `--project-directory`:
  project directory default Dokploy = direktori file compose (`deploy/`),
  jadi context `"."` = `deploy/` dan path dockerfile jadi
  `deploy/deploy/...` yang tidak ada. Dockerfile-nya sendiri juga COPY
  path dari root repo (`package.json`, `apps/`, `packages/`,
  `deploy/nginx/default.conf`), jadi context memang HARUS root repo.
  Dengan file Compose di root, project directory default Dokploy = root
  repo dan semua path resolve benar. File upstream
  `deploy/compose.prod.yaml` sengaja TIDAK diubah supaya pemakaian lokal
  upstream tetap jalan.
- **JANGAN pakai `deploy/compose.images.yaml`** di Dokploy LABS: image GHCR
  upstream (`ghcr.io/nextroad-dev/musecanvas-*`) hanya di-build untuk
  `amd64` — workflow `.github/workflows/docker-image.yml` tidak mengatur
  `platforms:` dan runner-nya `ubuntu-latest` (amd64). Host Dokploy LABS
  adalah **ARM64**, jadi pull image GHCR akan gagal
  (`no matching manifest for linux/arm64`). Build dari source aman karena
  semua base image multi-arch: `node:22-alpine`, `nginx:1.27-alpine`,
  `postgres:17-alpine`, `redis:7.4-alpine`.
- **JANGAN pakai `deploy/compose.yaml`** untuk produksi: file itu menjalankan
  MinIO + Mailpit bawaan (hanya untuk dev lokal) dan mengekspos port 9000 /
  9001 / 8025.

## 2. Layanan yang jalan (8 service di compose prod)

| Service | Image / build | Port internal | Fungsi |
| --- | --- | --- | --- |
| `postgres` | `postgres:17-alpine` | 5432 | Database utama (volume `postgres_data`) |
| `redis` | `redis:7.4-alpine` | 6379 | Antrean, rate limit, cache (volume `redis_data`, AOF on) |
| `db-password-sync` | `postgres:17-alpine` | — | Sinkronisasi password user DB (sekali jalan, lalu selesai) |
| `db-migrate` | build `api.Dockerfile` | — | Migrasi + seed DB (sekali jalan, lalu selesai) |
| `api` | build `deploy/docker/api.Dockerfile` | 3001 | Next.js API Routes, healthcheck `/api/health/ready` |
| `worker` | build `deploy/docker/worker.Dockerfile` (+ ffmpeg) | — | Konsumen antrean generate, thumbnail, tes kredensial |
| `web-next` | build `deploy/docker/web-next.Dockerfile` | 3000 | Frontend Next.js 15 (standalone) |
| `nginx` | build `deploy/docker/nginx.Dockerfile` | 80 | Reverse proxy: `/api/*` → api:3001, lainnya → web-next:3000 |

Satu-satunya port yang diekspos ke host: Nginx `${MUSECANVAS_HTTP_PORT:-8080}:80`.
Di Dokploy, set domain ke service `nginx` (port 80). Traefik Dokploy yang
mengurus TLS; `COOKIE_SECURE` default `true` di compose prod — sudah benar
untuk domain HTTPS.

**Volume yang harus persisten:** `postgres_data` dan `redis_data`
(Dokploy Compose umumnya mengelola volume bernama ini per project; pastikan
tidak hilang saat redeploy).

## 3. Environment variable (diisi di Dokploy → Environment)

Wajib — tanpa ini `api`/`worker`/`db-migrate` gagal start:

| Variable | Isi | Contoh / cara buat |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | Password superuser Postgres, bebas | Buat acak, mis. 32 karakter |
| `APP_MASTER_KEY` | Tepat 32 byte, 64 karakter hex ATAU base64/base64url | `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` — **simpan salinannya; semua kredensial supplier yang disimpan di /setup dienkripsi dengan key ini. Kalau hilang, kredensial tersimpan tidak bisa dibaca lagi.** |

Opsional (default sudah aman, biarkan kecuali ada alasan):

| Variable | Default | Keterangan |
| --- | --- | --- |
| `MUSECANVAS_HTTP_PORT` | `8080` | Port host untuk Nginx. Di Dokploy, domain diarahkan ke container, nilai ini umumnya tidak perlu diubah. |
| `COOKIE_SECURE` | `true` | Turunkan ke `false` hanya bila Nginx diekspos HTTP polos tanpa TLS. |
| `ALLOW_INSECURE_SMTP` | `false` | Tetap `false` untuk SMTP eksternal terenkripsi. |
| `ALLOW_INSECURE_PROVIDER_BASE_URL` | `false` | |
| `ALLOW_PRIVATE_PROVIDER_BASE_URL` | `false` | |
| `ALLOW_PLUGIN_UPLOAD` | `false` | **Tetap `false`** — bila `true`, plugin `.mjs` yang diunggah admin dieksekusi worker dengan akses ke semua kredensial supplier. |
| `PLUGIN_CACHE_DIR` | `/tmp/musecanvas-plugin-cache` | Jangan taruh di `/app`. |

**JANGAN isi sebagai env:** SMTP, S3, OAuth, batas upload, template prompt —
semuanya dikonfigurasi lewat halaman `/setup` dan disimpan terenkripsi di
database. Mengisinya sebagai env tidak berpengaruh.

## 4. Domain yang diusulkan

- **`musecanvas.masyamin.biz.id`** → service `nginx`, port `80`, HTTPS via Traefik Dokploy.
- Pastikan domain ini dipakai sebagai "Site URL" di langkah `/setup`
  (dipakai untuk email, callback OAuth, dan link berbagi).

## 5. Langkah deploy di Dokploy

1. Buat Application baru di Dokploy LABS, tipe **Compose**.
2. Hubungkan repo `ashabulymn/MuseCanvas` (branch `main`),
   Compose File: `compose.dokploy.yaml` (root repo — lihat bagian 1, jangan
   pakai `deploy/compose.prod.yaml`).
3. Isi environment variable wajib di atas (bagian 3). **Auto Deploy: OFF**
   (seperti app Dokploy lain — deploy manual supaya build besar tidak
   ke-trigger tiap push).
4. Deploy. Build pertama akan lama (4 image dari source: `api`, `worker`,
   `web-next`, `nginx` — termasuk `pnpm install --frozen-lockfile` dan
   build Next.js; perkiraan 10–25 menit di host ARM64, tergantung cache).
5. Tunggu semua service healthy: `postgres` → `db-password-sync` →
   `db-migrate` → `api` (healthcheck `/api/health/ready`) → `worker` dan
   `web-next` → `nginx`.
6. Buka `https://musecanvas.masyamin.biz.id` — browser akan redirect ke
   halaman panduan **`/setup`**.

## 6. Langkah `/setup` setelah live (wajib, di browser)

Panduan 5 langkah (wizard hanya menampilkan status tersimpan — tes koneksi
dan pengisian dilakukan di admin panel, lihat catatan di tiap langkah):

1. **Konfigurasi situs** — isi Site URL `https://musecanvas.masyamin.biz.id`
   dan nama situs. URL ini dipakai email, callback OAuth, dan link berbagi.
2. **SMTP & admin** — isi SMTP pengirim asli (host, port TLS, user, password)
   lalu tes kirim dari admin panel; tanpa SMTP yang jalan, OTP login email
   tidak akan terkirim dan akun admin pertama tidak bisa dibuat.
   Butuh: akun SMTP (mis. Gmail App Password / Mailgun / layanan SMTP lain).
3. **Object storage (S3)** — isi bucket S3-kompatibel (AWS S3 / Cloudflare R2 /
   MinIO eksternal) + access key + secret + region/endpoint. Atur **CORS**
   bucket (lihat `README.md` bagian "Persyaratan CORS bucket S3 eksternal",
   origin `https://musecanvas.masyamin.biz.id`). Tanpa S3, hasil generate
   tidak punya tempat penyimpanan.
4. **AI model & supplier** — isi kredensial provider image/video, mis.
   OpenAI (DALL·E 3 / GPT Image), Seedream (Volcengine), atau provider
   lain yang didukung plugin. Wizard TIDAK memvalidasi key — tes koneksi
   dilakukan dari admin panel setelah setup.
5. **Pemeriksaan lingkungan & selesai** — periksa hasil cek runtime server,
   konfirmasi item manual, lalu selesai. Setelah itu daftar/login lewat OTP
   email dan mulai berkarya di `/generate`.

## 7. Yang masih butuh input pemilik (sebelum/saat setup)

- [ ] Domain final: `musecanvas.masyamin.biz.id` (diusulkan; konfirmasi atau ganti).
- [ ] Akun SMTP + kredensial (host/port/user/password pengirim).
- [ ] Bucket S3 / R2 + access key + secret + CORS (atau putuskan: sewa MinIO
      eksternal / R2 gratis?).
- [ ] Provider AI + API key-nya (OpenAI? Seedream? provider lain?).
- [ ] (Opsional) OAuth GitHub / Google: Client ID + Client Secret bila mau
      login sosial; tanpa ini, login hanya OTP email + undangan.
- [ ] (Opsional) `APP_MASTER_KEY` dan `POSTGRES_PASSWORD`: dibuat saat
      deploy (simpan salinannya di tempat aman — terutama master key).

## 8. Risiko deploy terbesar

1. **S3 + SMTP wajib, tidak ada jalan pintas.** Compose prod tidak membawa
   MinIO/Mailpit; tanpa keduanya aplikasi bisa dibuka tapi tidak bisa
   login (OTP) dan tidak bisa menyimpan hasil. Ini blocker fungsional,
   bukan sekadar konfigurasi.
2. **Build pertama lama & berat.** 4 image Node.js dari source di ARM64;
   bila Dokploy timeout saat build, ulangi deploy (cache layer Docker
   biasanya membuat percobaan kedua jauh lebih cepat).
3. **GHCR upstream tidak bisa dipakai (amd64-only).** Jangan tergoda
   `compose.images.yaml`. Bila suatu hari mau image sendiri, ubah
   `IMAGE_OWNER: nextroad-dev` di `.github/workflows/docker-image.yml`
   menjadi `ashabulymn` dan tambahkan `platforms: linux/amd64,linux/arm64`
   — saat ini TIDAK diubah di fork ini.
4. **Master key hilang = kredensial hilang.** Semua kredensial supplier /
   OAuth di database dienkripsi turunan `APP_MASTER_KEY`. Rotasi key tanpa
   migrasi ulang akan membuat data terenkripsi lama tidak terbaca.
5. **Upload plugin default-deny — biarkan mati.** Mengaktifkan
   `ALLOW_PLUGIN_UPLOAD=true` berarti kode `.mjs` dari admin dieksekusi
   worker dengan akses penuh ke kredensial supplier.
6. **UI dalam aplikasi sebagian besar masih Mandarin.** Yang diterjemahkan
   di fork ini: README/dokumen deploy, halaman landing (`/`), metadata +
   `lang="id"`, dan langkah-langkah wizard `/setup`. Halaman workspace,
   admin panel, auth, dan generate masih Mandarin — terjemahan UI penuh
   adalah pekerjaan terpisah (puluhan file) dan butuh build check.
