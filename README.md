# ▶️ YouTube Video Downloader Pro

Modern web arayüzüne sahip, `yt-dlp` ve `ffmpeg` altyapısıyla çalışan yüksek performanslı YouTube video ve MP3 ses indirme uygulaması.

---

## ✨ Özellikler

- **Gelişmiş Video ve Ses Seçenekleri:**
  - **Video (MP4):** 1080p Full HD, 720p HD, 480p, 360p ve en yüksek mevcut kalite desteği.
  - **Ses (MP3):** 320 kbps ultra yüksek kaliteli MP3 dönüştürme.
- **Canlı İlerleme Takibi:**
  - Anlık indirme yüzdesi, hız (MB/s veya KB/s), indirilen/toplam dosya boyutu ve kalan süre (ETA).
- **Video Bilgisi ve Önizleme:**
  - Link girildiğinde anında video başlığı, kanal adı, görüntülenme sayısı, süre ve yüksek çözünürlüklü kapak resmi getirme.
- **Dahili Medya Kütüphanesi & Oynatıcı:**
  - İndirilen tüm videoları ve sesleri tarayıcı içinde doğrudan oynatabilen dahili video/ses oynatıcı.
  - Dosyaları tek tıkla doğrudan bilgisayara kaydetme veya silme.
- **Panodan Yapıştırma:**
  - "Yapıştır" butonu ile panodaki YouTube linkini tek tıkla yapıştırma ve otomatik getirme.

---

## 🚀 Çalıştırma

### Linux / macOS:
```bash
./start-server.sh
# veya
python3 server.py
```

### Windows:
`start-server.bat` dosyasına çift tıklayın veya:
```cmd
python server.py
```

Sunucu başladığında tarayıcınızda otomatik olarak `http://localhost:5180` adresi açılacaktır.

---

## 📦 Gereksinimler

- **Python 3.8+**
- **yt-dlp:** (`pip install yt-dlp`)
- **ffmpeg:** (Sistemde ses dönüştürme ve video birleştirme için gereklidir)
