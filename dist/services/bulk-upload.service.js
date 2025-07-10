"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BulkUploadService = void 0;
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = __importDefault(require("path"));
const chalk_1 = __importDefault(require("chalk"));
const glob_1 = require("glob");
const video_service_1 = require("./video.service");
const config_service_1 = require("./config.service");
class BulkUploadService {
    static generateJobId() {
        return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    // Find video files in directory
    static async findVideoFiles(directory, pattern) {
        const resolvedDir = path_1.default.resolve(directory);
        if (!await fs_extra_1.default.pathExists(resolvedDir)) {
            throw new Error(`Klasör bulunamadı: ${directory}`);
        }
        const stats = await fs_extra_1.default.stat(resolvedDir);
        if (!stats.isDirectory()) {
            throw new Error(`Geçerli bir klasör değil: ${directory}`);
        }
        const searchPattern = pattern || await config_service_1.ConfigService.getDefaultPattern();
        const globPattern = path_1.default.join(resolvedDir, searchPattern);
        try {
            const files = await (0, glob_1.glob)(globPattern, {
                nodir: true,
                absolute: true,
            });
            // Video dosyalarını filtrele
            const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv', '.m4v'];
            const videoFiles = files.filter(file => {
                const ext = path_1.default.extname(file).toLowerCase();
                return videoExtensions.includes(ext);
            });
            return videoFiles.sort();
        }
        catch (error) {
            throw new Error(`Dosya arama hatası: ${error.message}`);
        }
    }
    // Create upload jobs from file list
    static async createUploadJobs(files) {
        const jobs = [];
        for (const filePath of files) {
            try {
                const stats = await fs_extra_1.default.stat(filePath);
                const filename = path_1.default.basename(filePath);
                jobs.push({
                    id: this.generateJobId(),
                    filePath,
                    filename,
                    size: stats.size,
                    status: 'pending',
                });
            }
            catch (error) {
                console.warn(chalk_1.default.yellow(`⚠️ Dosya okunamadı, atlanıyor: ${filePath}`));
            }
        }
        return jobs;
    }
    // Upload single file with progress
    static async uploadSingleFile(job, options) {
        const { transcribe, language, onFileProgress } = options;
        try {
            job.status = 'uploading';
            job.progress = 0;
            const title = path_1.default.parse(job.filename).name;
            const video = await video_service_1.VideoService.uploadVideo(job.filePath, title, undefined, // description
            (progress) => {
                if (progress) {
                    job.progress = progress.percentage;
                }
                onFileProgress?.(job, `Uploading...`, progress?.percentage);
            });
            job.status = 'completed';
            job.videoId = video.id;
            job.progress = 100;
        }
        catch (error) {
            job.status = 'error';
            job.error = error.message;
            job.progress = 0;
        }
    }
    // Calculate upload summary
    static calculateSummary(jobs) {
        const summary = {
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
    static printSummary(summary) {
        const { total, completed, failed, inProgress, pending } = summary;
        console.log(chalk_1.default.blue('\n📊 Upload Özeti:'));
        console.log(`${chalk_1.default.bold('Toplam:')} ${total}`);
        console.log(`${chalk_1.default.green('Tamamlandı:')} ${completed}`);
        console.log(`${chalk_1.default.red('Başarısız:')} ${failed}`);
        console.log(`${chalk_1.default.yellow('Devam ediyor:')} ${inProgress}`);
        console.log(`${chalk_1.default.gray('Beklemede:')} ${pending}`);
        const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;
        console.log(`${chalk_1.default.bold('Başarı oranı:')} ${successRate}%`);
        // Başarısız dosyaları listele
        const failedJobs = summary.jobs.filter(job => job.status === 'error');
        if (failedJobs.length > 0) {
            console.log(chalk_1.default.red('\n❌ Başarısız yüklemeler:'));
            failedJobs.forEach(job => {
                console.log(`   ${chalk_1.default.red('•')} ${job.filename}: ${job.error}`);
            });
        }
        // Başarılı dosyaları listele
        const completedJobs = summary.jobs.filter(job => job.status === 'completed');
        if (completedJobs.length > 0) {
            console.log(chalk_1.default.green('\n✅ Başarılı yüklemeler:'));
            completedJobs.forEach(job => {
                console.log(`   ${chalk_1.default.green('•')} ${job.filename} → Video ID: ${job.videoId}`);
            });
        }
    }
    // Main bulk upload method
    static async bulkUpload(options) {
        const { directory, pattern, transcribe = false, language, concurrent = 2, onProgress, onFileProgress } = options;
        console.log(chalk_1.default.blue(`🔍 Video dosyaları aranıyor: ${directory}`));
        console.log(chalk_1.default.gray(`Pattern: ${pattern || 'default'}`));
        // 1. Find video files
        const files = await this.findVideoFiles(directory, pattern);
        if (files.length === 0) {
            console.log(chalk_1.default.yellow('⚠️ Video dosyası bulunamadı!'));
            return this.calculateSummary([]);
        }
        console.log(chalk_1.default.green(`✅ ${files.length} video dosyası bulundu:`));
        files.forEach((file, index) => {
            const size = fs_extra_1.default.statSync(file).size;
            const sizeStr = this.formatFileSize(size);
            console.log(`   ${index + 1}. ${path_1.default.basename(file)} (${sizeStr})`);
        });
        // 2. Create upload jobs
        const jobs = await this.createUploadJobs(files);
        if (jobs.length === 0) {
            console.log(chalk_1.default.red('❌ Upload edilebilir dosya bulunamadı!'));
            return this.calculateSummary([]);
        }
        console.log(chalk_1.default.blue(`\n🚀 ${jobs.length} dosya upload edilecek (${concurrent} eşzamanlı)`));
        if (transcribe) {
            console.log(chalk_1.default.blue(`🎤 Transkripsiyon aktif (Dil: ${language || 'auto'})`));
        }
        // 3. Process uploads with concurrency control
        const semaphore = new Array(concurrent).fill(null);
        let activeUploads = 0;
        let jobIndex = 0;
        const processNextJob = async () => {
            if (jobIndex >= jobs.length)
                return;
            const job = jobs[jobIndex++];
            if (!job)
                return;
            activeUploads++;
            console.log(chalk_1.default.blue(`⬆️ Başlatılıyor: ${job.filename}`));
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
                console.log(chalk_1.default.green(`✅ Tamamlandı: ${job.filename} → ${job.videoId}`));
            }
            else if (job.status === 'error') {
                console.log(chalk_1.default.red(`❌ Hata: ${job.filename} → ${job.error}`));
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
    static formatFileSize(bytes) {
        const sizes = ['B', 'KB', 'MB', 'GB'];
        if (bytes === 0)
            return '0 B';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }
    // Helper: Validate upload options
    static validateOptions(options) {
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
exports.BulkUploadService = BulkUploadService;
