# 🚀 Vamos CLI

**Vamos AI platformu için resmi CLI aracı** - Video yükleme ve transkripsiyon işlemlerini toplu olarak gerçekleştirin.

## 📦 Kurulum

### NPM ile Global Kurulum

```bash
npm install -g vamos-cli
```

### Local Kurulum (Geliştirme)

```bash
git clone https://github.com/vamos-ai/vamos.git
cd vamos/apps/cli
npm install
npm run build-production
npm link
```

## ⚙️ Konfigürasyon

CLI kullanmadan önce environment variable'ları ayarlayın:

```bash
export VAMOS_SUPABASE_URL="https://your-project.supabase.co"
export VAMOS_SUPABASE_ANON_KEY="your-anon-key"
export VAMOS_BACKEND_URL="https://api.vamos-ai.com"
```

## 🔐 Kimlik Doğrulama

```bash
# Giriş yap
vamos login

# Kullanıcı bilgilerini göster
vamos whoami

# Çıkış yap
vamos logout
```

## 📤 Video Yükleme

### Tek Dosya

```bash
# Basit yükleme
vamos upload --file video.mp4

# Transkripsiyon ile
vamos upload --file video.mp4 --transcribe --language tr
```

### Toplu Yükleme

```bash
# Klasörden tüm videolar
vamos upload --directory ./videos --transcribe

# Pattern ile filtreleme
vamos upload --directory ./videos --pattern "*.{mp4,mov}" --concurrent 3
```

## 📋 Video Yönetimi

```bash
# Video listesi
vamos list

# Duruma göre filtrele
vamos list --status completed

# Video detayları
vamos status <video-id>
```

## 🎯 Desteklenen Formatlar

- **Video**: MP4, MOV, AVI, MKV, WebM, FLV, WMV, M4V
- **Diller**: tr, en, es, fr, de, it, pt, ru, ja, ko, zh, auto

## 🔧 Komut Referansı

### Upload Seçenekleri

| Parametre      | Kısaltma | Açıklama              | Varsayılan                 |
| -------------- | -------- | --------------------- | -------------------------- |
| `--file`       | `-f`     | Tek dosya yükle       | -                          |
| `--directory`  | `-d`     | Klasör yükle          | -                          |
| `--pattern`    | `-p`     | Dosya pattern         | `*.{mp4,mov,avi,mkv,webm}` |
| `--transcribe` | `-t`     | Transkripsiyon başlat | `false`                    |
| `--language`   | `-l`     | Transkripsiyon dili   | `auto`                     |
| `--concurrent` | `-c`     | Eşzamanlı upload      | `2`                        |

## 📊 Kullanım Örnekleri

### Toplantı Kayıtları

```bash
vamos upload --directory ./meetings --transcribe --language tr --concurrent 2
```

### Eğitim Videoları

```bash
vamos upload --directory ./training --pattern "**/lesson-*.mp4" --transcribe
```

### Çoklu Dil Desteği

```bash
# İngilizce videolar
vamos upload --directory ./english --language en --transcribe

# Türkçe videolar
vamos upload --directory ./turkish --language tr --transcribe
```

## 🚨 Sorun Giderme

### Yaygın Hatalar

**Authentication Error**

```bash
vamos login  # Tekrar giriş yapın
```

**Configuration Error**

```bash
vamos config show  # Konfigürasyonu kontrol edin
```

**Upload Error**

```bash
vamos config env  # Environment variable'ları kontrol edin
```

## 🛠️ Geliştirme

```bash
# Geliştirme modu
npm run dev

# Build
npm run build-production

# Test
npm test
```

## 📄 Lisans

MIT License - [Vamos AI](https://vamos-ai.com)

## 🆘 Destek

- **Dokümantasyon**: [docs.vamos-ai.com](https://docs.vamos-ai.com)
- **GitHub Issues**: [github.com/vamos-ai/vamos/issues](https://github.com/vamos-ai/vamos/issues)
- **Email**: support@vamos-ai.com

---

**Vamos AI CLI v1.0.0** | Made with ❤️ in Turkey
# vamos-cli
