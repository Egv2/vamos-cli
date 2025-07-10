#!/bin/bash

# Vamos CLI VPS Quick Deploy Script
# Bu script VPS'e hızlı deployment için kullanılır

set -e

echo "🚀 Vamos CLI VPS Quick Deployment"
echo "=================================="

# Default değerler
CLI_SOURCE=${CLI_SOURCE:-$(pwd)}
CLI_TARGET=${CLI_TARGET:-"/opt/vamos-cli"}
SERVICE_USER=${SERVICE_USER:-"vamos"}

# Banner
cat << 'EOF'
 __      __                              _____ _      _____ 
 \ \    / /                             / ____| |    |_   _|
  \ \  / /_ _ _ __ ___   ___  ___       | |    | |      | |  
   \ \/ / _` | '_ ` _ \ / _ \/ __|      | |    | |      | |  
    \  / (_| | | | | | | (_) \__ \      | |____| |____ _| |_ 
     \/ \__,_|_| |_| |_|\___/|___/       \_____|______|_____|
                                                             
EOF

echo "🎯 VPS Deployment Parametreleri:"
echo "   Kaynak Dizin: $CLI_SOURCE"
echo "   Hedef Dizin: $CLI_TARGET"
echo "   Servis Kullanıcısı: $SERVICE_USER"
echo ""

# Onay al
read -p "🤔 Deployment'a devam etmek istiyor musunuz? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Deployment iptal edildi."
    exit 1
fi

# Ana deploy script'ini çağır
echo "🚀 Ana deployment script'i çalıştırılıyor..."
CLI_SOURCE="$CLI_SOURCE" CLI_TARGET="$CLI_TARGET" SERVICE_USER="$SERVICE_USER" ./scripts/deploy.sh vps

echo ""
echo "🎉 VPS Deployment Tamamlandı!"
echo ""
echo "📋 Deployment Özeti:"
echo "   ✅ CLI konumu: $CLI_TARGET"
echo "   ✅ Servis kullanıcısı: $SERVICE_USER"
echo "   ✅ Environment dosyası: /home/$SERVICE_USER/.vamos-env"
echo "   ✅ Global erişim: vamos komutları sistem genelinde kullanılabilir"
echo ""
echo "🔧 Deployment Sonrası Kontroller:"
echo "   • vamos --version"
echo "   • vamos --help"
echo "   • vamos config show"
echo ""
echo "🌐 Sunucu Bilgileri:"
echo "   • Supabase URL: http://167.235.183.107:8000"
echo "   • Backend URL: http://167.235.183.107:3001"
echo "   • Default Language: auto"
echo ""
echo "📚 İlk Kullanım:"
echo "   1. vamos login"
echo "   2. vamos upload --file video.mp4 --transcribe"
echo "   3. vamos list"
echo ""
echo "✨ Başarıyla tamamlandı! Vamos CLI artık VPS'te kullanıma hazır." 