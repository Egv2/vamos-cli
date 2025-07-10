#!/bin/bash

# Vamos CLI Universal Deployment Script
# Bu script CLI'ı hem local production hem de VPS'e deploy eder

set -e

# Deployment tipi kontrolü
DEPLOYMENT_TYPE=${1:-"local"}

if [[ "$DEPLOYMENT_TYPE" == "--help" || "$DEPLOYMENT_TYPE" == "-h" ]]; then
    echo "🚀 Vamos CLI Deployment Script"
    echo ""
    echo "Kullanım:"
    echo "  ./scripts/deploy.sh [local|vps] [options]"
    echo ""
    echo "Deployment Tipleri:"
    echo "  local    - Local production build ve test (default)"
    echo "  vps      - VPS'e direkt deployment"
    echo ""
    echo "VPS Deployment için environment variables:"
    echo "  CLI_SOURCE       - Kaynak dizin (default: current dir)"
    echo "  CLI_TARGET       - Hedef dizin (default: /opt/vamos-cli)"
    echo "  SERVICE_USER     - Servis kullanıcısı (default: vamos)"
    echo "  VAMOS_ENV        - Environment (default: production)"
    echo ""
    exit 0
fi

echo "🚀 Vamos CLI Deployment başlatılıyor... (Tip: $DEPLOYMENT_TYPE)"

# Konfigürasyon değişkenleri
CLI_SOURCE=${CLI_SOURCE:-$(pwd)}
CLI_TARGET=${CLI_TARGET:-"/opt/vamos-cli"}
SERVICE_USER=${SERVICE_USER:-"vamos"}
VAMOS_ENV=${VAMOS_ENV:-"production"}

# Local Production Deployment
if [[ "$DEPLOYMENT_TYPE" == "local" ]]; then
    echo "📍 Local Production Deployment"
    echo "================================"

    # 1. Clean install
    echo "📦 Dependencies yükleniyor..."
    rm -rf node_modules package-lock.json
    npm install

    # 2. Production build
    echo "🔨 Production build başlatılıyor..."
    npm run build-production

    # 3. Tests
    echo "🧪 Testler çalıştırılıyor..."
    npm test

    # 4. Version check
    echo "📋 Version kontrol ediliyor..."
    VERSION=$(node dist/index.js --version)
    echo "CLI Version: $VERSION"

    # 5. Package size check
    echo "📊 Package boyutu kontrol ediliyor..."
    npm pack --dry-run

    # 6. Publish confirmation
    echo "✅ CLI production'a hazır!"
    echo ""
    echo "📤 NPM'e publish etmek için:"
    echo "   npm publish"
    echo ""
    echo "🌍 Global kurulum için kullanıcılar şunu çalıştıracak:"
    echo "   npm install -g vamos-cli"
    echo ""

# VPS Deployment
elif [[ "$DEPLOYMENT_TYPE" == "vps" ]]; then
    echo "📍 VPS Deployment"
    echo "=================="
    echo "🎯 Kaynak: $CLI_SOURCE"
    echo "🎯 Hedef: $CLI_TARGET"
    echo "👤 Kullanıcı: $SERVICE_USER"
    echo "🌍 Environment: $VAMOS_ENV"
    echo ""

    # Sistem kullanıcısı kontrolü
    if ! id "$SERVICE_USER" &>/dev/null; then
        echo "👤 Servis kullanıcısı oluşturuluyor: $SERVICE_USER"
        sudo useradd -r -s /bin/bash -d "/home/$SERVICE_USER" "$SERVICE_USER" || true
        sudo mkdir -p "/home/$SERVICE_USER"
        sudo chown "$SERVICE_USER:$SERVICE_USER" "/home/$SERVICE_USER"
    fi

    # CLI klasörünü hazırla
    echo "📁 CLI klasörü hazırlanıyor..."
    sudo mkdir -p "$CLI_TARGET"
    sudo chown "$SERVICE_USER:$SERVICE_USER" "$CLI_TARGET"

    # Mevcut CLI'ı durdur (eğer çalışıyorsa)
    echo "⏹️ Mevcut CLI servisleri kontrol ediliyor..."
    sudo pkill -f "vamos" || true

    # CLI dosyalarını kopyala
    echo "📋 CLI dosyaları kopyalanıyor..."
    sudo -u "$SERVICE_USER" cp -r "$CLI_SOURCE"/* "$CLI_TARGET"/

    # Dependencies yükle (production only)
    echo "📦 Production dependencies yükleniyor..."
    cd "$CLI_TARGET"
    sudo -u "$SERVICE_USER" npm ci --production

    # Build et
    echo "🔨 Production build yapılıyor..."
    sudo -u "$SERVICE_USER" npm run build-production

    # Global link oluştur
    echo "🔗 Global link oluşturuluyor..."
    sudo npm link

    # Environment dosyası oluştur
    echo "⚙️ Environment variables ayarlanıyor..."
    sudo -u "$SERVICE_USER" tee "/home/$SERVICE_USER/.vamos-env" << 'EOF'
# Vamos CLI Environment Configuration
export VAMOS_SUPABASE_URL="http://167.235.183.107:8000"
export VAMOS_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE"
export VAMOS_BACKEND_URL="http://api.vamos-ai.com"
export VAMOS_DEFAULT_LANGUAGE="auto"
export VAMOS_ENV="production"
export PATH="$PATH:/opt/vamos-cli/dist"
EOF

    # Bashrc'ye environment source ekle
    if ! grep -q "source ~/.vamos-env" "/home/$SERVICE_USER/.bashrc" 2>/dev/null; then
        echo "source ~/.vamos-env" | sudo -u "$SERVICE_USER" tee -a "/home/$SERVICE_USER/.bashrc"
    fi

    # Global environment için sistem geneli ayar
    sudo tee "/etc/profile.d/vamos-cli.sh" << 'EOF'
export VAMOS_SUPABASE_URL="http://167.235.183.107:8000"
export VAMOS_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE"
export VAMOS_BACKEND_URL="http://api.vamos-ai.com"
export VAMOS_DEFAULT_LANGUAGE="auto"
export VAMOS_ENV="production"
EOF

    # Permissions düzenle
    sudo chmod +x "/etc/profile.d/vamos-cli.sh"
    sudo chmod +x "$CLI_TARGET/dist/index.js"

    # Test et
    echo "🧪 CLI testi yapılıyor..."
    if sudo -u "$SERVICE_USER" bash -c "source ~/.vamos-env && vamos --version"; then
        echo "✅ CLI test başarılı!"
    else
        echo "❌ CLI test başarısız!"
        exit 1
    fi

    # Servis kullanıcısına sudo yetkisi ver (vamos komutları için)
    sudo tee "/etc/sudoers.d/vamos-cli" << EOF
$SERVICE_USER ALL=(ALL) NOPASSWD: /usr/local/bin/vamos, /opt/vamos-cli/dist/index.js
EOF

    echo "✅ Vamos CLI başarıyla VPS'e deploy edildi!"
    echo "📍 Konum: $CLI_TARGET"
    echo "👤 Kullanıcı: $SERVICE_USER"
    echo "🎯 Global kullanım: vamos --help"

else
    echo "❌ Geçersiz deployment tipi: $DEPLOYMENT_TYPE"
    echo "Kullanım: ./scripts/deploy.sh [local|vps]"
    exit 1
fi

echo ""
echo "🎯 CLI Kullanımı:"
echo "   vamos login"
echo "   vamos config show"
echo "   vamos upload --file video.mp4 --transcribe"
echo "   vamos list --limit 10"
echo ""
echo "📚 Daha fazla bilgi için:"
echo "   vamos --help"
echo ""
echo "✨ Deployment tamamlandı!" 