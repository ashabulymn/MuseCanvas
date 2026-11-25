# Shared Packages

- `contracts`: DTO, tipe bersama, dan kode error yang aman diekspos ke browser.
- `domain`: aturan bisnis dan state machine yang tidak bergantung framework.
- `database`: migration, transaksi, dan akses data; query resource pengguna wajib dibatasi ke pemiliknya.
- `providers`: adapter layanan gambar, object storage, dan email.
- `config`: pembacaan dan validasi environment variable sisi server.

Entitas database dan respons mentah supplier tidak boleh dimasukkan ke `contracts`.
