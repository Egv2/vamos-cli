import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';
import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

interface SessionData {
  access_token: string;
  refresh_token: string;
  user_id: string;
  email: string;
  expires_at: number;
}

export class AuthService {
  private static readonly CONFIG_PATH = path.join(os.homedir(), '.vamos-cli');
  private static readonly SESSION_FILE = path.join(this.CONFIG_PATH, 'session.json');
  private static supabase: SupabaseClient | null = null;

  private static getSupabaseClient(): SupabaseClient {
    if (!this.supabase) {
      const supabaseUrl = process.env.VAMOS_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.VAMOS_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error(
          'Supabase credentials not found. Please set VAMOS_SUPABASE_URL and VAMOS_SUPABASE_ANON_KEY environment variables.'
        );
      }

      this.supabase = createClient(supabaseUrl, supabaseAnonKey);
    }
    return this.supabase;
  }

  static async login(): Promise<void> {
    // Config klasörünü oluştur
    await fs.ensureDir(this.CONFIG_PATH);

    console.log(chalk.blue('🔐 Vamos hesabınıza giriş yapın'));

    const { email, password } = await inquirer.prompt([
      {
        type: 'input',
        name: 'email',
        message: 'E-posta adresiniz:',
        validate: (input: string) => {
          if (!input.includes('@')) return 'Geçerli bir e-posta adresi girin';
          return true;
        }
      },
      {
        type: 'password',
        name: 'password',
        message: 'Şifreniz:',
        mask: '*',
        validate: (input: string) => {
          if (input.length < 6) return 'Şifre en az 6 karakter olmalı';
          return true;
        }
      }
    ]);

    const supabase = this.getSupabaseClient();

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        throw new Error(`Giriş hatası: ${error.message}`);
      }

      if (!data.session || !data.user) {
        throw new Error('Session oluşturulamadı');
      }

      // Session'ı kaydet
      const sessionData: SessionData = {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        user_id: data.user.id,
        email: data.user.email || '',
        expires_at: data.session.expires_at || 0
      };

      await fs.writeJson(this.SESSION_FILE, sessionData);

      console.log(chalk.green(`✅ Hoş geldiniz, ${data.user.email}!`));
      console.log(chalk.gray(`User ID: ${data.user.id}`));

    } catch (error: any) {
      throw new Error(`Giriş başarısız: ${error.message}`);
    }
  }

  static async logout(): Promise<void> {
    try {
      // Supabase'den logout
      if (this.supabase) {
        await this.supabase.auth.signOut();
      }
    } catch (error) {
      // Logout hatasını ignore et, session dosyasını sil
      console.warn(chalk.yellow('⚠️ Remote logout hatası, local session temizleniyor...'));
    }

    // Local session dosyasını sil
    if (await fs.pathExists(this.SESSION_FILE)) {
      await fs.remove(this.SESSION_FILE);
    }

    console.log(chalk.yellow('👋 Oturum kapatıldı!'));
  }

  static async isAuthenticated(): Promise<boolean> {
    try {
      const token = await this.getAuthToken();
      return !!token;
    } catch {
      return false;
    }
  }

  static async getAuthToken(): Promise<string> {
    if (!await fs.pathExists(this.SESSION_FILE)) {
      throw new Error('Giriş yapmalısınız: vamos login');
    }

    const sessionData: SessionData = await fs.readJson(this.SESSION_FILE);
    
    // Token süresi kontrolü (5 dakika önce expire olacaksa refresh et)
    const expiresAt = sessionData.expires_at * 1000; // Convert to milliseconds
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;

    if (expiresAt - now < fiveMinutes) {
      // Token yenileme gerekli
      console.log(chalk.blue('🔄 Token yenileniyor...'));
      
      const supabase = this.getSupabaseClient();
      
      try {
        const { data, error } = await supabase.auth.setSession({
          access_token: sessionData.access_token,
          refresh_token: sessionData.refresh_token
        });

        if (error || !data.session) {
          throw new Error('Token yenilenemedi');
        }

        // Yeni session'ı kaydet
        const newSessionData: SessionData = {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          user_id: data.user?.id || sessionData.user_id,
          email: data.user?.email || sessionData.email,
          expires_at: data.session.expires_at || 0
        };

        await fs.writeJson(this.SESSION_FILE, newSessionData);

        console.log(chalk.green('✅ Token yenilendi'));
        return data.session.access_token;

      } catch (error: any) {
        // Token yenileme başarısız, session'ı sil
        await fs.remove(this.SESSION_FILE);
        throw new Error('Session süresi dolmuş, tekrar giriş yapın: vamos login');
      }
    }

    return sessionData.access_token;
  }

  static async getUserId(): Promise<string> {
    if (!await fs.pathExists(this.SESSION_FILE)) {
      throw new Error('Giriş yapmalısınız: vamos login');
    }

    const sessionData: SessionData = await fs.readJson(this.SESSION_FILE);
    return sessionData.user_id;
  }

  static async getUserEmail(): Promise<string> {
    if (!await fs.pathExists(this.SESSION_FILE)) {
      throw new Error('Giriş yapmalısınız: vamos login');
    }

    const sessionData: SessionData = await fs.readJson(this.SESSION_FILE);
    return sessionData.email;
  }

  static async getCurrentUser(): Promise<User | null> {
    try {
      const token = await this.getAuthToken();
      const supabase = this.getSupabaseClient();
      
      const { data: { user }, error } = await supabase.auth.getUser(token);
      
      if (error || !user) {
        return null;
      }
      
      return user;
    } catch {
      return null;
    }
  }

  static async validateAuth(): Promise<void> {
    if (!await this.isAuthenticated()) {
      console.log(chalk.red('❌ Önce giriş yapmalısınız:'));
      console.log(chalk.blue('   vamos login'));
      process.exit(1);
    }
  }
} 