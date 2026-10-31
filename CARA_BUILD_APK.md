# Cara Build File .APK untuk Android (ESP32 Studio)

Project ini sudah dikonfigurasi penuh dengan **Capacitor** + **GitHub Actions** sehingga kamu bisa membuat file `.apk` asli secara gratis tanpa perlu install Android SDK di laptop!

---

## 🚀 Cara 1: Menggunakan GitHub Actions (Paling Mudah & Otomatis)

1. Buka browser dan pergi ke **https://github.com/new**
2. Buat repository baru (bebas nama, misal: `esp32-studio`), pilih **Public** atau **Private**.
3. Buka PowerShell di laptop kamu, lalu jalankan perintah berikut (ganti `USERNAME` dan `REPO` dengan akun GitHub kamu):

```bash
cd "C:\Users\A S U S\.cline\data\workspaces\chat\esp32-ide"
git branch -M main
git remote add origin https://github.com/USERNAME/REPO.git
git push -u origin main
```

4. Setelah push selesai:
   - Buka halaman repository kamu di GitHub di browser.
   - Klik tab **Actions** di bagian atas.
   - Kamu akan melihat workflow **"Build Android APK"** sedang berjalan otomatis (~2-4 menit).
   - Setelah selesai (tanda centang hijau ✅), klik workflow tersebut.
   - Di bagian bawah ada judul **Artifacts** -> klik **esp32-studio-debug-apk** untuk mendownload file `.apk` nya!
5. Pindahkan file `.apk` tersebut ke HP Android kamu, lalu klik untuk install! 📱

---

## 💻 Cara 2: Build di Komputer / Laptop (Lokal via Android Studio)

Jika suatu saat kamu menginstall Android Studio di komputer:
1. Buka **Android Studio**
2. Klik **Open**, lalu pilih folder:
   `C:\Users\A S U S\.cline\data\workspaces\chat\esp32-ide\android`
3. Tunggu Gradle sync selesai.
4. Klik menu **Build** > **Build Bundle(s) / APK(s)** > **Build APK(s)**.
5. File `.apk` akan langsung terbuat di:
   `android\app\build\outputs\apk\debug\app-debug.apk`

---

## ⚙️ Cara Kerja Aplikasi di HP:
Saat aplikasi Android `.apk` dibuka di HP kamu:
1. Buka sidebar ☰ -> Masukkan alamat **Home Server** kamu (misal `http://192.168.1.100:3456`).
2. Aplikasi akan otomatis terhubung ke Home Server untuk compile kode ESP32.
3. Mendukung 2 mode upload:
   - **WiFi OTA**: Langsung flash lewat WiFi ke ESP32 tanpa kabel sama sekali.
   - **USB Direct**: Colok ESP32 ke HP via kabel OTG.
