import { AuthService } from './auth.service';
import { ConfigService } from './config.service';
import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

export interface VideoInfo {
  id: string;
  title: string;
  description?: string;
  status: string;
  created_at: string;
  updated_at: string;
  duration?: number;
  file_size?: number;
  rev_job_id?: string;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface UploadResult {
  videoId: string;
  uploadUrl: string;
  path: string;
}

export class VideoService {
  private static async getAuthHeaders() {
    const token = await AuthService.getAuthToken();
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  private static async getSupabaseClient() {
    const supabaseUrl = await ConfigService.getSupabaseUrl();
    const supabaseKey = await ConfigService.getSupabaseAnonKey();
    return createClient(supabaseUrl, supabaseKey);
  }

  static async uploadVideo(
    filePath: string,
    title?: string,
    description?: string,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<VideoInfo> {
    try {
      // 1. Dosya kontrolü
      if (!fs.existsSync(filePath)) {
        throw new Error(`Dosya bulunamadı: ${filePath}`);
      }

      const stats = fs.statSync(filePath);
      const filename = path.basename(filePath);
      
      console.log(`Dosya yükleniyor: ${filename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

      // 2. Backend'den video ID al
      const backendUrl = await ConfigService.getBackendUrl();
      const uploadResponse = await axios.post(
        `${backendUrl}/api/stream/upload-url`,
        {
          filename,
          size: stats.size
        },
        { headers: await this.getAuthHeaders() }
      );

      const videoId = uploadResponse.data.videoId;
      console.log('Video ID alındı:', videoId);

      // 3. Supabase client ile dosyayı yükle
      const supabase = await this.getSupabaseClient();
      const user = await AuthService.getCurrentUser();
      
      if (!user) {
        throw new Error('Kullanıcı bulunamadı');
      }

      const storagePath = `${user.id}/${videoId}/${videoId}.mp4`;
      const fileBuffer = fs.readFileSync(filePath);

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
      const supabaseUrl = await ConfigService.getSupabaseUrl();
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/videos/${storagePath}`;

      // 5. Video kaydı oluştur
      const videoResponse = await axios.post(
        `${backendUrl}/api/videos`,
        {
          title: title || filename.replace(/\.[^/.]+$/, ''),
          description: description || '',
          storagePath: storagePath,
          publicUrl: publicUrl,
          status: 'processing'
        },
        { headers: await this.getAuthHeaders() }
      );

      const video: VideoInfo = videoResponse.data.data;
      console.log(`Video kaydı oluşturuldu: ${video.id}`);

      return video;

    } catch (error: any) {
      console.error('Video upload hatası:', error.response?.data || error.message);
      throw new Error(`Video upload hatası: ${error.response?.data?.error || error.message}`);
    }
  }

  // Backward compatibility için
  static async upload(
    filePath: string,
    title?: string,
    description?: string,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<VideoInfo> {
    return this.uploadVideo(filePath, title, description, onProgress);
  }

  static async getVideos(): Promise<VideoInfo[]> {
    try {
      const backendUrl = await ConfigService.getBackendUrl();
      const response = await axios.get(
        `${backendUrl}/api/videos`,
        { headers: await this.getAuthHeaders() }
      );

      return response.data.data || [];
    } catch (error: any) {
      console.error('Video listesi alma hatası:', error.response?.data || error.message);
      throw new Error(`Video listesi alınamadı: ${error.response?.data?.error || error.message}`);
    }
  }

  static async getVideoStatus(videoId: string): Promise<VideoInfo> {
    try {
      const backendUrl = await ConfigService.getBackendUrl();
      const response = await axios.get(
        `${backendUrl}/api/videos/${videoId}`,
        { headers: await this.getAuthHeaders() }
      );

      return response.data.data;
    } catch (error: any) {
      console.error('Video durum kontrolü hatası:', error.response?.data || error.message);
      throw new Error(`Video durumu alınamadı: ${error.response?.data?.error || error.message}`);
    }
  }

  static async deleteVideo(videoId: string): Promise<void> {
    try {
      const backendUrl = await ConfigService.getBackendUrl();
      await axios.delete(
        `${backendUrl}/api/videos/${videoId}`,
        { headers: await this.getAuthHeaders() }
      );

      console.log(`Video silindi: ${videoId}`);
    } catch (error: any) {
      console.error('Video silme hatası:', error.response?.data || error.message);
      throw new Error(`Video silinemedi: ${error.response?.data?.error || error.message}`);
    }
  }

  static async getTranscript(videoId: string): Promise<any> {
    try {
      const backendUrl = await ConfigService.getBackendUrl();
      const response = await axios.get(
        `${backendUrl}/api/transcripts/${videoId}`,
        { headers: await this.getAuthHeaders() }
      );

      return response.data;
    } catch (error: any) {
      console.error('Transkript alma hatası:', error.response?.data || error.message);
      throw new Error(`Transkript alınamadı: ${error.response?.data?.error || error.message}`);
    }
  }
} 
