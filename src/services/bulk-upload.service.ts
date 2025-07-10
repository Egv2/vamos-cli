import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { glob } from 'glob';
import { VideoService } from './video.service';
import { ConfigService } from './config.service';

interface UploadJob {
  id: string;
  filePath: string;
  filename: string;
  size: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  videoId?: string;
  error?: string;
  progress?: number;
}

interface BulkUploadOptions {
  directory: string;
  pattern?: string;
  transcribe?: boolean;
  language?: string;
  concurrent?: number;
  onProgress?: (summary: UploadSummary) => void;
  onFileProgress?: (job: UploadJob, step: string, progress?: number) => void;
}

interface UploadSummary {
  total: number;
  completed: number;
  failed: number;
  inProgress: number;
  pending: number;
  jobs: UploadJob[];
}

export class BulkUploadService {
  private static generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Find video files in directory
  static async findVideoFiles(directory: string, pattern?: string): Promise<string[]> {
    const resolvedDir = path.resolve(directory);
    
    if (!await fs.pathExists(resolvedDir)) {
      throw new Error(`Klasör bulunamadı: ${directory}`);
    }

    const stats = await fs.stat(resolvedDir);
    if (!stats.isDirectory()) {
      throw new Error(`Geçerli bir klasör değil: ${directory}`);
    }

    const searchPattern = pattern || await ConfigService.getDefaultPattern();
    const globPattern = path.join(resolvedDir, searchPattern);
    
    try {
      const files = await glob(globPattern, {
        nodir: true,
        absolute: true,
      });

      // Video dosyalarını filtrele
      const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv', '.m4v'];
      const videoFiles = files.filter(file => {
        const ext = path.extname(file).toLowerCase();
        return videoExtensions.includes(ext);
      });

      return videoFiles.sort();

    } catch (error: any) {
      throw new Error(`Dosya arama hatası: ${error.message}`);
    }
  }

  // Create upload jobs from file list
  static async createUploadJobs(files: string[]): Promise<UploadJob[]> {
    const jobs: UploadJob[] = [];

    for (const filePath of files) {
      try {
        const stats = await fs.stat(filePath);
        const filename = path.basename(filePath);

        jobs.push({
          id: this.generateJobId(),
          filePath,
          filename,
          size: stats.size,
          status: 'pending',
        });

      } catch (error) {
        console.warn(chalk.yellow(`⚠️ Dosya okunamadı, atlanıyor: ${filePath}`));
      }
    }

    return jobs;
  }

  // Upload single file with progress
  static async uploadSingleFile(
    job: UploadJob, 
    options: Pick<BulkUploadOptions, 'transcribe' | 'language' | 'onFileProgress'>
  ): Promise<void> {
    const { transcribe, language, onFileProgress } = options;

    try {
      job.status = 'uploading';
      job.progress = 0;

      const title = path.parse(job.filename).name;

       const video = await VideoService.uploadVideo(
         job.filePath,
         title,
         undefined, // description
         (progress) => {
           if (progress) {
             job.progress = progress.percentage;
           }
           onFileProgress?.(job, `Uploading...`, progress?.percentage);
         }
       );

      job.status = 'completed';
      job.videoId = video.id;
      job.progress = 100;

    } catch (error: any) {
      job.status = 'error';
      job.error = error.message;
      job.progress = 0;
    }
  }

  // Calculate upload summary
  static calculateSummary(jobs: UploadJob[]): UploadSummary {
    const summary: UploadSummary = {
      total: jobs.length,
      completed: 0,
      failed: 0,
      inProgress: 0,
      pending: 0,
      jobs: [...jobs],
    };

    jobs.forEach(job => {
      switch (job.status) {
        case 'completed':
          summary.completed++;
          break;
        case 'error':
          summary.failed++;
          break;
        case 'uploading':
          summary.inProgress++;
          break;
        case 'pending':
          summary.pending++;
          break;
      }
    });

    return summary;
  }

  // Print upload summary
  static printSummary(summary: UploadSummary): void {
    const { total, completed, failed, inProgress, pending } = summary;

    console.log(chalk.blue('\n📊 Upload Özeti:'));
    console.log(`${chalk.bold('Toplam:')} ${total}`);
    console.log(`${chalk.green('Tamamlandı:')} ${completed}`);
    console.log(`${chalk.red('Başarısız:')} ${failed}`);
    console.log(`${chalk.yellow('Devam ediyor:')} ${inProgress}`);
    console.log(`${chalk.gray('Beklemede:')} ${pending}`);

    const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    console.log(`${chalk.bold('Başarı oranı:')} ${successRate}%`);

    // Başarısız dosyaları listele
    const failedJobs = summary.jobs.filter(job => job.status === 'error');
    if (failedJobs.length > 0) {
      console.log(chalk.red('\n❌ Başarısız yüklemeler:'));
      failedJobs.forEach(job => {
        console.log(`   ${chalk.red('•')} ${job.filename}: ${job.error}`);
      });
    }

    // Başarılı dosyaları listele
    const completedJobs = summary.jobs.filter(job => job.status === 'completed');
    if (completedJobs.length > 0) {
      console.log(chalk.green('\n✅ Başarılı yüklemeler:'));
      completedJobs.forEach(job => {
        console.log(`   ${chalk.green('•')} ${job.filename} → Video ID: ${job.videoId}`);
      });
    }
  }

  // Main bulk upload method
  static async bulkUpload(options: BulkUploadOptions): Promise<UploadSummary> {
    const { 
      directory, 
      pattern, 
      transcribe = false, 
      language, 
      concurrent = 2,
      onProgress,
      onFileProgress 
    } = options;

    console.log(chalk.blue(`🔍 Video dosyaları aranıyor: ${directory}`));
    console.log(chalk.gray(`Pattern: ${pattern || 'default'}`));

    // 1. Find video files
    const files = await this.findVideoFiles(directory, pattern);
    
    if (files.length === 0) {
      console.log(chalk.yellow('⚠️ Video dosyası bulunamadı!'));
      return this.calculateSummary([]);
    }

    console.log(chalk.green(`✅ ${files.length} video dosyası bulundu:`));
    files.forEach((file, index) => {
      const size = fs.statSync(file).size;
      const sizeStr = this.formatFileSize(size);
      console.log(`   ${index + 1}. ${path.basename(file)} (${sizeStr})`);
    });

    // 2. Create upload jobs
    const jobs = await this.createUploadJobs(files);
    
    if (jobs.length === 0) {
      console.log(chalk.red('❌ Upload edilebilir dosya bulunamadı!'));
      return this.calculateSummary([]);
    }

    console.log(chalk.blue(`\n🚀 ${jobs.length} dosya upload edilecek (${concurrent} eşzamanlı)`));
    if (transcribe) {
      console.log(chalk.blue(`🎤 Transkripsiyon aktif (Dil: ${language || 'auto'})`));
    }

    // 3. Process uploads with concurrency control
    const semaphore = new Array(concurrent).fill(null);
    let activeUploads = 0;
    let jobIndex = 0;

    const processNextJob = async (): Promise<void> => {
      if (jobIndex >= jobs.length) return;

      const job = jobs[jobIndex++];
      if (!job) return;
      
      activeUploads++;

      console.log(chalk.blue(`⬆️ Başlatılıyor: ${job.filename}`));

       await this.uploadSingleFile(job, {
         transcribe,
         ...(language && { language }),
         onFileProgress: (currentJob, step, progress) => {
           onFileProgress?.(currentJob, step, progress);
           
           // Progress raporu
           const status = currentJob.status === 'completed' ? '✅' : 
                         currentJob.status === 'error' ? '❌' : '⏳';
           const progressStr = typeof progress === 'number' ? ` (${progress}%)` : '';
           console.log(`   ${status} ${currentJob.filename}: ${step}${progressStr}`);
         },
       });

      activeUploads--;

      const summary = this.calculateSummary(jobs);
      onProgress?.(summary);

      // Status raporu
      if (job.status === 'completed') {
        console.log(chalk.green(`✅ Tamamlandı: ${job.filename} → ${job.videoId}`));
      } else if (job.status === 'error') {
        console.log(chalk.red(`❌ Hata: ${job.filename} → ${job.error}`));
      }

      // Sonraki job'u başlat
      if (jobIndex < jobs.length) {
        await processNextJob();
      }
    };

    // Start initial concurrent uploads
    const initialPromises = semaphore.map(() => processNextJob());
    await Promise.all(initialPromises);

    // Wait for all uploads to complete
    while (activeUploads > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const finalSummary = this.calculateSummary(jobs);
    
    console.log('');
    this.printSummary(finalSummary);

    return finalSummary;
  }

  // Helper: Format file size
  private static formatFileSize(bytes: number): string {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  // Helper: Validate upload options
  static validateOptions(options: BulkUploadOptions): void {
    if (!options.directory) {
      throw new Error('Directory parametresi gerekli');
    }

    if (options.concurrent && (options.concurrent < 1 || options.concurrent > 10)) {
      throw new Error('Concurrent değeri 1-10 arasında olmalı');
    }

    const validLanguages = ['auto', 'tr', 'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh'];
    if (options.language && !validLanguages.includes(options.language)) {
      throw new Error(`Geçersiz dil kodu: ${options.language}. Geçerli kodlar: ${validLanguages.join(', ')}`);
    }
  }
} 