#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { AuthService } from './services/auth.service';
import { ConfigService } from './services/config.service';
import { VideoService } from './services/video.service';
import { BulkUploadService } from './services/bulk-upload.service';
import fs from 'fs-extra';
import path from 'path';

const program = new Command();

// CLI Version ve bilgileri
program
  .name('vamos')
  .description('Vamos AI CLI - Video upload ve transkripsiyon aracı')
  .version('1.0.0');

// Global error handler
process.on('uncaughtException', (error) => {
  console.error(chalk.red('❌ Beklenmeyen hata:'), error.message);
  console.error(chalk.gray('Stack:'), error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('❌ Promise rejection:'), reason);
  process.exit(1);
});

// =================================================================
// AUTH COMMANDS
// =================================================================

// Login komutu
program
  .command('login')
  .description('Vamos hesabınıza giriş yapın')
  .action(async () => {
    try {
      await ConfigService.validateConfig();
      await AuthService.login();
    } catch (error: any) {
      console.error(chalk.red('❌ Giriş hatası:'), error.message);
      process.exit(1);
    }
  });

// Logout komutu
program
  .command('logout')
  .description('Oturumu kapatın')
  .action(async () => {
    try {
      await AuthService.logout();
    } catch (error: any) {
      console.error(chalk.red('❌ Çıkış hatası:'), error.message);
      process.exit(1);
    }
  });

// =================================================================
// CONFIG COMMANDS
// =================================================================

// Config ana komutu
const configCmd = program
  .command('config')
  .description('CLI konfigürasyonu yönetimi');

// Config show
configCmd
  .command('show')
  .alias('list')
  .description('Mevcut konfigürasyonu göster')
  .action(async () => {
    try {
      await ConfigService.showConfig();
    } catch (error: any) {
      console.error(chalk.red('❌ Config hatası:'), error.message);
      process.exit(1);
    }
  });

// Config set
configCmd
  .command('set <key> <value>')
  .description('Konfigürasyon değeri ayarla')
  .action(async (key: string, value: string) => {
    try {
      const validKeys = ['supabaseUrl', 'supabaseAnonKey', 'backendUrl', 'defaultLanguage', 'defaultPattern'];
      if (!validKeys.includes(key)) {
        throw new Error(`Geçersiz key: ${key}. Geçerli keyler: ${validKeys.join(', ')}`);
      }
      await ConfigService.setConfigValue(key as any, value);
    } catch (error: any) {
      console.error(chalk.red('❌ Config set hatası:'), error.message);
      process.exit(1);
    }
  });

// Config reset
configCmd
  .command('reset')
  .description('Konfigürasyonu sıfırla')
  .action(async () => {
    try {
      await ConfigService.resetConfig();
    } catch (error: any) {
      console.error(chalk.red('❌ Config reset hatası:'), error.message);
      process.exit(1);
    }
  });

// Config env (debug için)
configCmd
  .command('env')
  .description('Environment variables durumunu göster')
  .action(() => {
    try {
      ConfigService.showEnvironment();
    } catch (error: any) {
      console.error(chalk.red('❌ Environment hatası:'), error.message);
      process.exit(1);
    }
  });

// =================================================================
// UPLOAD COMMANDS
// =================================================================

// Upload komutu
program
  .command('upload')
  .description('Video dosyalarını yükle')
  .option('-f, --file <file>', 'Tek dosya yükle')
  .option('-d, --directory <directory>', 'Klasörden toplu yükleme')
  .option('-p, --pattern <pattern>', 'Dosya arama pattern\'i (glob)')
  .option('-t, --transcribe', 'Yükleme sonrası transkripsiyon başlat')
  .option('-l, --language <language>', 'Transkripsiyon dili (tr, en, auto, vb.)', 'auto')
  .option('-c, --concurrent <number>', 'Eşzamanlı upload sayısı', '2')
  .option('--title <title>', 'Video başlığı (tek dosya için)')
  .option('--description <description>', 'Video açıklaması (tek dosya için)')
  .action(async (options) => {
    try {
      await ConfigService.validateConfig();
      await AuthService.validateAuth();

      const { file, directory, pattern, transcribe, language, concurrent, title, description } = options;

      // Validation
      if (!file && !directory) {
        throw new Error('--file veya --directory parametresi gerekli');
      }

      if (file && directory) {
        throw new Error('--file ve --directory aynı anda kullanılamaz');
      }

      // Single file upload
      if (file) {
        console.log(chalk.blue(`🔄 Tek dosya yükleniyor: ${file}`));
        
        if (!await fs.pathExists(file)) {
          throw new Error(`Dosya bulunamadı: ${file}`);
        }

        const video = await VideoService.uploadVideo(
          file,
          title || path.parse(file).name,
          description,
          (progress) => {
            console.log(chalk.blue(`   Dosya yükleniyor... ${progress.percentage}%`));
          }
        );

        console.log(chalk.green(`✅ Video başarıyla yüklendi!`));
        console.log(chalk.gray(`Video ID: ${video.id}`));
        console.log(chalk.gray(`Status: ${video.status}`));

        if (transcribe) {
          console.log(chalk.blue(`🎤 Transkripsiyon başlatıldı. Status kontrolü: vamos status ${video.id}`));
        }
      }

      // Directory bulk upload
      if (directory) {
        console.log(chalk.blue(`🔄 Toplu yükleme başlatılıyor: ${directory}`));

        const concurrentNum = parseInt(concurrent, 10);
        if (isNaN(concurrentNum) || concurrentNum < 1 || concurrentNum > 10) {
          throw new Error('Concurrent değeri 1-10 arasında olmalı');
        }

        BulkUploadService.validateOptions({
          directory,
          pattern,
          transcribe: transcribe || false,
          language,
          concurrent: concurrentNum,
        });

        await BulkUploadService.bulkUpload({
          directory,
          pattern,
          transcribe: transcribe || false,
          language,
          concurrent: concurrentNum,
        });
      }

    } catch (error: any) {
      console.error(chalk.red('❌ Upload hatası:'), error.message);
      process.exit(1);
    }
  });

// =================================================================
// VIDEO MANAGEMENT COMMANDS
// =================================================================

// List videos
program
  .command('list')
  .alias('ls')
  .description('Videolarınızı listele')
  .option('-s, --status <status>', 'Duruma göre filtrele')
  .option('-l, --limit <number>', 'Gösterilecek maksimum video sayısı', '20')
  .action(async (options) => {
    try {
      await ConfigService.validateConfig();
      await AuthService.validateAuth();

      const videos = await VideoService.getVideos();
      const { status, limit } = options;

      let filteredVideos = videos;
      
      if (status) {
        filteredVideos = videos.filter(v => v.status === status);
      }

      const limitNum = parseInt(limit, 10);
      if (!isNaN(limitNum)) {
        filteredVideos = filteredVideos.slice(0, limitNum);
      }

      if (filteredVideos.length === 0) {
        console.log(chalk.yellow('📭 Video bulunamadı'));
        return;
      }

      console.log(chalk.blue(`\n📺 Videolarınız (${filteredVideos.length}/${videos.length}):\n`));

      filteredVideos.forEach((video, index) => {
        const statusColor = video.status === 'completed' ? 'green' :
                          video.status === 'error' ? 'red' :
                          video.status === 'transcribing' ? 'yellow' : 'blue';

        console.log(`${index + 1}. ${chalk.bold(video.title)}`);
        console.log(`   ${chalk.gray('ID:')} ${video.id}`);
        console.log(`   ${chalk.gray('Status:')} ${chalk[statusColor](video.status)}`);
        console.log(`   ${chalk.gray('Created:')} ${new Date(video.created_at).toLocaleDateString('tr-TR')}`);
        if (video.duration) {
          console.log(`   ${chalk.gray('Duration:')} ${Math.round(video.duration)}s`);
        }
        if (video.rev_job_id) {
          console.log(`   ${chalk.gray('Rev Job:')} ${video.rev_job_id}`);
        }
        console.log('');
      });

    } catch (error: any) {
      console.error(chalk.red('❌ Liste hatası:'), error.message);
      process.exit(1);
    }
  });

// Video status
program
  .command('status <videoId>')
  .description('Video durumunu kontrol et')
  .action(async (videoId: string) => {
    try {
      await ConfigService.validateConfig();
      await AuthService.validateAuth();

      const video = await VideoService.getVideoStatus(videoId);

      console.log(chalk.blue(`\n📺 Video Durumu: ${video.title}\n`));
      console.log(`${chalk.bold('ID:')} ${video.id}`);
      console.log(`${chalk.bold('Status:')} ${video.status}`);
      console.log(`${chalk.bold('Created:')} ${new Date(video.created_at).toLocaleDateString('tr-TR')}`);
      if (video.updated_at) {
        console.log(`${chalk.bold('Updated:')} ${new Date(video.updated_at).toLocaleDateString('tr-TR')}`);
      }

      if (video.duration) {
        console.log(`${chalk.bold('Duration:')} ${Math.round(video.duration)}s`);
      }

      if (video.file_size) {
        const sizeStr = (video.file_size / (1024 * 1024)).toFixed(2);
        console.log(`${chalk.bold('Size:')} ${sizeStr} MB`);
      }

      if (video.rev_job_id) {
        console.log(`${chalk.bold('Rev Job ID:')} ${video.rev_job_id}`);
      }

    } catch (error: any) {
      console.error(chalk.red('❌ Status hatası:'), error.message);
      process.exit(1);
    }
  });

// =================================================================
// UTILITIES
// =================================================================

// Whoami
program
  .command('whoami')
  .description('Mevcut kullanıcı bilgilerini göster')
  .action(async () => {
    try {
      await AuthService.validateAuth();
      
      const email = await AuthService.getUserEmail();
      const userId = await AuthService.getUserId();
      
      console.log(chalk.blue('\n👤 Kullanıcı Bilgileri:\n'));
      console.log(`${chalk.bold('Email:')} ${email}`);
      console.log(`${chalk.bold('User ID:')} ${userId}`);

    } catch (error: any) {
      console.error(chalk.red('❌ Kullanıcı bilgisi hatası:'), error.message);
      process.exit(1);
    }
  });

// Help iyileştirmesi
program.on('--help', () => {
  console.log('');
  console.log(chalk.blue('📚 Örnek Kullanım:'));
  console.log('');
  console.log('  $ vamos login');
  console.log('  $ vamos upload --file video.mp4 --transcribe --language tr');
  console.log('  $ vamos upload --directory ./videos --pattern "*.{mp4,mov}" --transcribe');
  console.log('  $ vamos list --status completed');
  console.log('  $ vamos status abc-123-def');
  console.log('  $ vamos config show');
  console.log('');
  console.log(chalk.blue('🔗 Daha fazla bilgi: https://docs.vamos-ai.com/cli'));
});

// CLI'yı başlat
if (require.main === module) {
  program.parse();
} 