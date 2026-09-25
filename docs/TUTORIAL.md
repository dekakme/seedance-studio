# Tutorial Seedance Studio

Seedance Studio adalah web app pribadi untuk membuat video AI lewat [Higgsfield API](https://docs.higgsfield.ai).
App ini mendukung Seedance 2.5, Kling 3.0, Higgsfield Genjutsu, MiniMax H3, dan semua model video lain di
Higgsfield (66 endpoint). App berjalan di komputer Anda sendiri dan dikunci dengan satu password.

> ⚠️ Setiap video yang dibuat **memotong kredit Higgsfield Anda**. Perkiraan biaya tampil di tombol Generate,
> jadi selalu cek sebelum menekannya.

---

## 1. Yang dibutuhkan

| Kebutuhan | Keterangan |
|-----------|------------|
| **Node.js 20.9 atau lebih baru** (disarankan 22/24) | Unduh di [nodejs.org](https://nodejs.org). Cek dengan `node -v`. |
| **Git** | Untuk meng-clone repo. |
| **Akun Higgsfield + API key** | Buat di [console.higgsfield.ai](https://console.higgsfield.ai) → API Keys. Anda akan mendapat **Key ID** dan **Key Secret**. |
| **Kredit Higgsfield** | Isi saldo di console. Tanpa kredit, generate akan gagal. |

ffmpeg (untuk memotong video) sudah ikut terpasang otomatis lewat npm, jadi tidak perlu diinstal manual.

---

## 2. Instalasi

```bash
git clone https://github.com/dekakme/seedance-studio.git
cd seedance-studio
npm install
```

## 3. Konfigurasi `.env.local`

Salin template-nya:

```bash
cp .env.example .env.local
```

Di Windows (Command Prompt), pakai `copy .env.example .env.local`.

Lalu isi `.env.local`:

```env
# Key ID dan Key Secret dari console Higgsfield, digabung dengan titik dua
HF_CREDENTIALS=key-id-anda:key-secret-anda

# Password untuk login ke app ini (bebas, buat yang kuat)
APP_PASSWORD=ganti-dengan-password-anda

# String acak minimal 32 karakter untuk mengamankan sesi login
SESSION_SECRET=
```

Buat `SESSION_SECRET` dengan perintah ini, lalu tempel hasilnya:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> 🔒 `.env.local` **jangan pernah** di-commit atau dibagikan. File ini sudah dikecualikan oleh `.gitignore`.
> Kalau key Anda sempat bocor, segera hapus dan buat key baru di console Higgsfield.

## 4. Menjalankan app

```bash
npm run dev
```

Buka **http://localhost:3000**, lalu login dengan `APP_PASSWORD` Anda.

Untuk pemakaian sehari-hari yang lebih cepat, jalankan mode produksi:

```bash
npm run build
npm start
```

---

## 5. Cara memakai

Layar dibagi dua: **panel kiri** untuk membuat video, dan **panel kanan (History)** untuk semua hasil Anda.

### 5.1 Memilih model

Klik baris **Model** untuk membuka daftar model. Ketik di kotak pencarian untuk menyaring.

- **Featured:** Seedance 2.5, Kling 3.0, Higgsfield Genjutsu, dan MiniMax H3. Keempatnya punya tampilan
  yang dirapikan khusus dan perkiraan biaya yang dihitung otomatis.
- **Model lain** (Wan, Kling 2.x/O3/Omni, Hailuo, PixVerse, Cinema Studio, LTX, Grok, dan lainnya).
  Form-nya dibuat otomatis dari dokumentasi resmi masing-masing model. Di bawah tombol Generate tampil teks
  harga resminya, bukan angka perkiraan.

### 5.2 Mode Seedance 2.5

| Tab | Kegunaan |
|-----|----------|
| **Create Video → References** | Tanpa media berarti *text-to-video*. Kalau Anda menambah gambar, video, atau audio referensi, mode otomatis menjadi *reference-to-video*. |
| **Create Video → Frames** | Membuat video dari gambar awal (dan, opsional, gambar akhir). |
| **Create Video → Extend Video** | Memperpanjang video yang sudah ada. |
| **Edit Video** | Mengubah video yang sudah ada sesuai prompt. |

### 5.3 Tag referensi `@Image1`, `@Video1`, `@Audio1`

1. Klik **+** di kotak referensi untuk upload gambar, video, atau audio.
2. Setiap file mendapat label, misalnya `Image1` atau `Video1`. Nomornya dihitung per jenis sesuai urutan upload.
3. Di prompt, ketik `@` untuk membuka menu referensi, atau klik label pada thumbnail. Contoh:
   `@Image1 mengendarai sepeda melewati gerbang merah, kamera mengikuti dari belakang`.
4. Tag yang tidak punya referensi akan berwarna merah dan memunculkan peringatan.

Klik thumbnail untuk melihatnya dalam ukuran besar.

### 5.4 Memotong video saat upload

Setiap kali Anda meng-upload video, muncul jendela **Trim video**:

- Geser slider **Start** dan **End**, atau pakai *Set start/end at playhead* setelah memutar video.
- **Play selection** memutar hanya bagian yang dipilih.
- **Trim & upload** memotong video di server (presisi per frame), lalu meng-upload hasilnya.
- **Use full video** meng-upload video utuh.

Memotong video juga **menghemat biaya**, karena beberapa model (Seedance edit/extend/referensi dan Genjutsu)
ikut menagih detik video input.

### 5.5 Pengaturan

- **Durasi, rasio, resolusi:** chip di bawah pemilih model. Klik untuk membuka pilihannya.
- **Bitrate** (Seedance): *High* untuk kualitas terbaik, *Standard* untuk file lebih kecil.
- **Quality** (Kling): Standard, Pro, atau 4K. **CFG** mengatur seberapa ketat model mengikuti prompt
  (rendah = lebih bebas, tinggi = lebih patuh).
- **Audio On/Off:** tombol di bawah prompt.

### 5.6 History

- Status video diperbarui otomatis: *Queued* → *Generating* → *Done*. Biasanya butuh 1–10 menit.
- Video yang selesai otomatis diunduh ke folder `storage/videos/`.
- Tombol di setiap kartu:
  - **Rerun:** buat ulang dengan setelan yang sama (meminta konfirmasi dan menagih lagi).
  - **✎ (Reuse):** memuat setelan ke panel kiri untuk diubah.
  - **⏩ (Extend):** memperpanjang video ini dengan Seedance.
  - **⬇ (Download)**, **Copy prompt**, dan **🗑 (Delete)**.
  - **Cancel:** hanya tersedia selama masih *Queued*.
- Pilih **List** atau **Grid** di kanan atas.

---

## 6. Biaya (perkiraan, sebelum diskon akun)

| Model | Harga |
|-------|-------|
| Seedance 2.5 | ≈ $0,82 untuk 4 detik 480p; ≈ $2,31 untuk 5 detik 720p (dihitung dari token video) |
| Kling 3.0 | Standard $0,0462/detik, Pro $0,0616/detik, 4K $0,231/detik (harga promo) |
| Genjutsu | $0,159/detik video input di 480p (harga promo) |
| MiniMax H3 | $0,13/detik, ditambah $0,08 per gambar referensi di atas 5 |
| Model lain | Lihat teks harga di bawah tombol Generate |

Tips hemat: coba dulu dengan **durasi terpendek dan resolusi terendah**. Setelah hasilnya pas, baru buat
versi final.

---

## 7. Memperbarui daftar model

Kalau Higgsfield menambah model baru, jalankan:

```bash
npm run sync-models
```

Perintah ini membaca dokumentasi Higgsfield dan memperbarui `lib/catalog.json`. Model baru langsung muncul
di pemilih Model, tanpa perlu mengubah kode.

---

## 8. Data Anda

| Lokasi | Isi |
|--------|-----|
| `data/app.db` | Riwayat semua generate (SQLite) |
| `storage/videos/` | File video hasil |

Kedua folder tidak ikut ke git. Backup secara manual kalau riwayatnya penting.

---

## 9. Masalah umum

| Gejala | Solusi |
|--------|--------|
| *"Higgsfield API key is invalid or missing"* | Cek `HF_CREDENTIALS` di `.env.local`: formatnya `key-id:key-secret`, tanpa spasi. Restart server setelah mengubahnya. |
| *"Not enough Higgsfield credits"* | Isi saldo di console Higgsfield. |
| *"Another next dev server is already running"* | Tutup server lama (tutup terminalnya atau hentikan prosesnya), lalu jalankan `npm run dev` lagi. |
| Port 3000 sudah dipakai | Jalankan di port lain: `npm run dev -- --port 3100`. |
| Upload gagal untuk file besar | Batasnya 200 MB per file. Potong video dulu dengan fitur trim. |
| Status lama sekali di *Queued* | Antrean Higgsfield sedang ramai. Job yang tidak selesai dalam 60 menit otomatis ditandai gagal. |
| Lupa password app | Ubah `APP_PASSWORD` di `.env.local`, lalu restart server. |

---

## 10. Keamanan

- App ini dirancang untuk **pemakaian pribadi atau tim kecil** dengan satu password bersama.
- API key hanya disimpan di server. Browser tidak pernah melihatnya.
- Kalau ingin dipasang di internet, **wajib pakai HTTPS** (misalnya lewat reverse proxy seperti Caddy atau
  Nginx) dan gunakan password yang kuat. Siapa pun yang tahu password bisa memakai kredit Anda.
