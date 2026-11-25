# Deploy

Semua artefak deploy repo ini terkumpul di direktori ini. Semua perintah dijalankan dari root repo, dan `--project-directory .` mengunci root repo sebagai basis path Compose; file environment memakai `.env` di root secara eksplisit.

- `compose.yaml`: lingkungan full-stack lokal default, build dari source untuk `api`, `worker`, `web-next`, `nginx`, plus PostgreSQL, Redis, MinIO, Mailpit. `db-migrate` setelah migrasi SQL menjalankan `scripts/seed-bundled-services.ts` dengan `BUNDLED_SERVICES=true`, menulis nilai default Mailpit / MinIO bawaan ke database (sudah terkonfigurasi, belum terverifikasi), sehingga halaman panduan langsung terisi.
- `compose.dev.yaml`: pintu masuk lingkungan dev, dipakai dengan perintah eksplisit `docker compose --project-directory . --env-file .env -f deploy/compose.dev.yaml`, juga untuk pengembangan lokal.
- `compose.prod.yaml`: template deploy dari source, TIDAK berisi MinIO / Mailpit, TIDAK memberi nilai default SMTP / S3; semua konfigurasi aplikasi lewat halaman panduan `/setup` dan ditulis ke database.
- `compose.images.yaml`: deploy memakai image GHCR yang sudah di-build, TIDAK berisi MinIO / Mailpit, default mengekspos Nginx lewat `18080:80`, konfigurasi aplikasi juga sama-sama tidak terisi.
- `docker/`: definisi empat image `api`, `worker`, `web-next`, `nginx` (konteks build Compose semuanya root repo `.`, konfigurasi Nginx disalin dari `deploy/nginx`; image `api` berisi `scripts/` agar `db-migrate` bisa memanggil script migrasi dan seed).
- `nginx/`: konfigurasi reverse proxy `/api` dan aset statis Web.

Thumbnail galeri (objek preview turunan): `apps/worker` setelah produk berhasil diunggah membuat satu gambar preview dengan sisi terpanjang 512px (gambar diubah ke WebP memakai sharp, video diambil satu frame memakai ffmpeg lalu diubah ke JPEG), key objek diturunkan murni dari key sumber (`<source>.thumb-512.webp|.jpg`, direktori dan prefix sama), frame video itu sekaligus ditulis ke `assets.poster_object_key` dan `thumbnail_object_key`. ffmpeg disediakan oleh `apk add --no-cache ffmpeg` di `deploy/docker/worker.Dockerfile` (paket native musl Alpine; binary `ffmpeg-static` dari npm berbasis glibc dan tidak bisa dieksekusi di image ini). Kegagalan membuat preview apa pun hanya mencatat `thumbnail_state` sebagai `failed`, tidak pernah memengaruhi hasil tugas, dan grid galeri otomatis kembali memakai gambar asli.

Setelah upgrade ke versi yang membawa fitur ini, jalankan backfill sekali, kalau tidak aset baru punya preview sedangkan aset lama masih mengunduh gambar asli dan tampilan grid tidak konsisten (`api` tidak berisi ffmpeg, baris video akan tercatat `failed`, jadi backfill lengkap dieksekusi di dalam container `worker`):

```bash
docker compose --project-directory . --env-file .env -f deploy/compose.yaml \
  exec worker sh -c "pnpm --filter @musecanvas/database exec tsx ../../scripts/backfill-asset-thumbnails.ts"
```

Script ini idempotent dan bisa dijalankan ulang, mendukung `--dry-run`, `--limit=<n>`, `--kind=image|video|all`; untuk `deploy/compose.prod.yaml` / `compose.images.yaml` tinggal ganti `compose.yaml`-nya saja.

`.env` hanya berisi bootstrap dan saklar deploy: `POSTGRES_PASSWORD`, `APP_MASTER_KEY`, `MINIO_ROOT_*` (stack bawaan), `MUSECANVAS_IMAGE_TAG` / `MUSECANVAS_HTTP_PORT`, `COOKIE_SECURE`, serta saklar `ALLOW_INSECURE_*` / `ALLOW_PLUGIN_UPLOAD` yang defaultnya semua `false`. SMTP, konfigurasi S3 aplikasi, alamat publik, kredensial client OAuth, batas upload, dan template prompt adalah konfigurasi database, tidak lagi dikirim lewat environment variable. Script lama `prepare-prompt-templates` masih ada di `scripts/` untuk kompatibilitas manual, tidak lagi di-mount atau dieksekusi oleh file Compose mana pun.

Kebijakan cookie: stack lokal `compose.yaml` / `compose.dev.yaml` melayani langsung lewat HTTP, jadi `COOKIE_SECURE` default `false`; bila kedua pintu masuk ini dipakai di belakang reverse proxy TLS, set ke `true`. `compose.prod.yaml` / `compose.images.yaml` mengasumsikan deploy produksi bert TLS sehingga default `true`; bila port Nginx-nya memang sengaja diekspos langsung sebagai HTTP polos, set `COOKIE_SECURE=false` di `.env`, kalau tidak browser tidak akan mengirim balik cookie setup/session.

Upload paket kode plugin (default mati, perlu `ALLOW_PLUGIN_UPLOAD=true`): paket plugin provider yang diunggah admin (`plugin_id@version` + file `.mjs` yang mandiri) transit lewat object storage — `api` memvalidasi lalu menulis ke tabel `provider_plugins` dan menyimpan artefak ke bucket, `worker` mengambilnya kembali lalu melakukan dynamic `import()`. `api` dan `worker` adalah image yang saling independen dan tidak berbagi volume apa pun, jadi `worker` hanya bisa menulis cache lokal di `PLUGIN_CACHE_DIR` (default `backend-env` adalah `/tmp/musecanvas-plugin-cache`, tidak boleh di layer image `/app`). `nginx/default.conf` membuat location terpisah untuk dua pintu upload berukuran besar: `/api/admin/plugins/upload` menaikkan `client_max_body_size` ke `8m`, `/api/images/edit` (edit sebagian: browser mengirim gambar sumber lengkap plus alpha mask sampai 4MB dalam satu request multipart) ke `24m`; keduanya sengaja mengulang lengkap konfigurasi `proxy_pass` + `proxy_set_header` dari `/api/`: upstream di-resolve lewat variabel `resolver`, location yang hanya menimpa batas ukuran saja akan salah mem-proxy secara diam-diam. `object_key` adalah key objek bucket privat, respons antarmuka apa pun tidak boleh mengembalikannya ke client.

Kompatibilitas upgrade (hanya dipertahankan satu versi, opsional): session/OTP yang dienkripsi key lama (`SESSION_SECRET`), kredensial client OAuth (`OAUTH_CREDENTIALS_ENCRYPTION_KEY`), dan kredensial supplier (`PROVIDER_CREDENTIALS_ENCRYPTION_KEY`) masih bisa dibaca lewat fallback read-only, semua penulisan baru hanya memakai key turunan `APP_MASTER_KEY`. Keempat file Compose sudah meneruskan ketiga variabel ini lewat `backend-env` bersama (semuanya opsional, default kosong), instalasi baru biarkan kosong, versi berikutnya akan menghapusnya. `scripts/generate-env.mjs` hanya membuat/melengkapi bootstrap key (`POSTGRES_PASSWORD`, `APP_MASTER_KEY`, `MINIO_ROOT_*`), tidak pernah membuat key lama, nilai yang sudah ada tidak pernah diubah.

Migrasi database: `db-migrate` menjalankan `packages/database/src/migrate.ts` yang hanya menggerakkan migrator berurutan, mengeksekusi tiap file di `packages/database/migrations/NNNN_*.sql` dalam transaksi terpisah dan mencatatnya ke `schema_migrations` (advisory lock level sesi memastikan hanya satu executor bila ada banyak instance). Database yang dibangun versi lama dari satu script utuh tidak punya catatan riwayat, saat pertama jalan akan dikenali sebagai legacy lalu diputar ulang penuh (semua statement idempotent), setelah itu hanya file baru yang dieksekusi. `tsx src/migrate.ts --dry-run` hanya menampilkan migrasi yang menunggu. File migrasi yang sudah dieksekusi tidak boleh diubah atau dihapus, perubahan apa pun harus lewat file baru.

Enkripsi ulang kredensial supplier (jalankan sekali setelah upgrade ke versi yang berisi `0027_credentials_converge`): kredensial yang masih terenkripsi `PROVIDER_CREDENTIALS_ENCRYPTION_KEY` lama dienkripsi ulang memakai key turunan `APP_MASTER_KEY`; setelah selesai, key lama bisa dihapus dari jalur baca. Script ini per-baris transaksi + compare-and-swap, bisa diinterupsi dan dijalankan ulang, hanya mengeluarkan id kredensial dan kode error yang stabil; satu baris gagal saja akan mengakhiri dengan exit code bukan nol.

```bash
docker compose --project-directory . --env-file .env -f deploy/compose.yaml \
  exec worker sh -c "pnpm --filter @musecanvas/database exec tsx ../../scripts/reencrypt-provider-credentials.ts --dry-run"
```

Setelah memastikan output tidak ada `failed`, hapus `--dry-run` lalu jalankan sekali lagi.

Tes konektivitas kredensial supplier dieksekusi oleh `worker` (hanya dialah yang memuat kode plugin, upload plugin pun bisa dites dengan cara yang sama): `api` mendaftarkan permintaan tes pada baris kredensial lalu menunggu maksimal sekitar 20 detik, `worker` mengambil permintaan yang menunggu setiap 2 detik. Bila `worker` tidak berjalan, tes akan tertahan di status "menguji", dan selesai sendiri setelah worker jalan.

Contoh (dari root repo):

```bash
docker compose --project-directory . --env-file .env -f deploy/compose.yaml up --build -d
docker compose --project-directory . --env-file .env -f deploy/compose.images.yaml up -d
docker compose --project-directory . --env-file .env -f deploy/compose.prod.yaml up --build -d
```

Key asli hanya boleh diinjeksikan lewat environment lokal atau platform deploy, jangan di-commit ke `.env`.

> ⚠️ **Dokploy LABS (ARM64):** pakai `deploy/compose.prod.yaml` (build dari source). JANGAN pakai `compose.images.yaml` — image GHCR upstream hanya `amd64` (workflow tidak mengatur `platforms:`). Lihat `DOKPLOY.md` di root repo.
