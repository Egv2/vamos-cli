"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VideoService = void 0;
const auth_service_1 = require("./auth.service");
const config_service_1 = require("./config.service");
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = __importDefault(require("path"));
const axios_1 = __importDefault(require("axios"));
const supabase_js_1 = require("@supabase/supabase-js");
class VideoService {
    static async getAuthHeaders() {
        const token = await auth_service_1.AuthService.getAuthToken();
        return {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
    }
    static async getSupabaseClient() {
        const supabaseUrl = await config_service_1.ConfigService.getSupabaseUrl();
        const supabaseKey = await config_service_1.ConfigService.getSupabaseAnonKey();
        return (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
    }
    static async uploadVideo(filePath, title, description, onProgress) {
        try {
            // 1. Dosya kontrolü
            if (!fs_extra_1.default.existsSync(filePath)) {
                throw new Error(`Dosya bulunamadı: ${filePath}`);
            }
            const stats = fs_extra_1.default.statSync(filePath);
            const filename = path_1.default.basename(filePath);
            console.log(`Dosya yükleniyor: ${filename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
            // 2. Backend'den video ID al
            const backendUrl = await config_service_1.ConfigService.getBackendUrl();
            const uploadResponse = await axios_1.default.post(`${backendUrl}/api/stream/upload-url`, {
                filename,
                size: stats.size
            }, { headers: await this.getAuthHeaders() });
            const videoId = uploadResponse.data.videoId;
            console.log('Video ID alındı:', videoId);
            // 3. Supabase client ile dosyayı yükle
            const supabase = await this.getSupabaseClient();
            const user = await auth_service_1.AuthService.getCurrentUser();
            if (!user) {
                throw new Error('Kullanıcı bulunamadı');
            }
            const storagePath = `${user.id}/${videoId}/${videoId}.mp4`;
            const fileBuffer = fs_extra_1.default.readFileSync(filePath);
            // Progress simulation for file upload
            if (onProgress) {
                onProgress({ loaded: 0, total: stats.size, percentage: 0 });
            }
            const { error: uploadError } = await supabase.storage
                .from('videos')
                .upload(storagePath, fileBuffer, {
                cacheControl: '3600',
                upsert: false,
            });
            if (uploadError) {
                throw new Error(`Supabase upload hatası: ${uploadError.message}`);
            }
            if (onProgress) {
                onProgress({ loaded: stats.size, total: stats.size, percentage: 100 });
            }
            console.log('Dosya başarıyla yüklendi:', storagePath);
            // 4. Public URL oluştur
            const supabaseUrl = await config_service_1.ConfigService.getSupabaseUrl();
            const publicUrl = `${supabaseUrl}/storage/v1/object/public/videos/${storagePath}`;
            // 5. Video kaydı oluştur
            const videoResponse = await axios_1.default.post(`${backendUrl}/api/videos`, {
                title: title || filename.replace(/\.[^/.]+$/, ''),
                description: description || '',
                storagePath: storagePath,
                publicUrl: publicUrl,
                status: 'processing'
            }, { headers: await this.getAuthHeaders() });
            const video = videoResponse.data.data;
            console.log(`Video kaydı oluşturuldu: ${video.id}`);
            return video;
        }
        catch (error) {
            console.error('Video upload hatası:', error.response?.data || error.message);
            throw new Error(`Video upload hatası: ${error.response?.data?.error || error.message}`);
        }
    }
    // Backward compatibility için
    static async upload(filePath, title, description, onProgress) {
        return this.uploadVideo(filePath, title, description, onProgress);
    }
    static async getVideos() {
        try {
            const backendUrl = await config_service_1.ConfigService.getBackendUrl();
            const response = await axios_1.default.get(`${backendUrl}/api/videos`, { headers: await this.getAuthHeaders() });
            return response.data.data || [];
        }
        catch (error) {
            console.error('Video listesi alma hatası:', error.response?.data || error.message);
            throw new Error(`Video listesi alınamadı: ${error.response?.data?.error || error.message}`);
        }
    }
    static async getVideoStatus(videoId) {
        try {
            const backendUrl = await config_service_1.ConfigService.getBackendUrl();
            const response = await axios_1.default.get(`${backendUrl}/api/videos/${videoId}`, { headers: await this.getAuthHeaders() });
            return response.data.data;
        }
        catch (error) {
            console.error('Video durum kontrolü hatası:', error.response?.data || error.message);
            throw new Error(`Video durumu alınamadı: ${error.response?.data?.error || error.message}`);
        }
    }
    static async deleteVideo(videoId) {
        try {
            const backendUrl = await config_service_1.ConfigService.getBackendUrl();
            await axios_1.default.delete(`${backendUrl}/api/videos/${videoId}`, { headers: await this.getAuthHeaders() });
            console.log(`Video silindi: ${videoId}`);
        }
        catch (error) {
            console.error('Video silme hatası:', error.response?.data || error.message);
            throw new Error(`Video silinemedi: ${error.response?.data?.error || error.message}`);
        }
    }
    static async getTranscript(videoId) {
        try {
            const backendUrl = await config_service_1.ConfigService.getBackendUrl();
            const response = await axios_1.default.get(`${backendUrl}/api/transcripts/${videoId}`, { headers: await this.getAuthHeaders() });
            return response.data;
        }
        catch (error) {
            console.error('Transkript alma hatası:', error.response?.data || error.message);
            throw new Error(`Transkript alınamadı: ${error.response?.data?.error || error.message}`);
        }
    }
}
exports.VideoService = VideoService;
