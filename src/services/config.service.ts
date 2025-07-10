import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { config as loadEnv } from 'dotenv';

interface ConfigData {
  supabaseUrl?: string | undefined;
  supabaseAnonKey?: string | undefined;
  backendUrl?: string | undefined;
  defaultLanguage?: string | undefined;
  defaultPattern?: string | undefined;
}

export class ConfigService {
  private static readonly CONFIG_PATH = path.join(os.homedir(), '.vamos-cli');
  private static readonly CONFIG_FILE = path.join(this.CONFIG_PATH, 'config.json');
  private static config: ConfigData | null = null;

  static {
    // .env dosyasını yükle (project root'da)
    const envPaths = [
      path.join(process.cwd(), '.env'),
      path.join(process.cwd(), '../../.env'), // CLI apps/ içinde ise root'daki .env
      path.join(__dirname, '../../../.env'), // Built version için
    ];

    for (const envPath of envPaths) {
      if (fs.existsSync(envPath)) {
        loadEnv({ path: envPath });
        break;
      }
    }
  }

  private static async loadConfig(): Promise<ConfigData> {
    if (this.config) {
      return this.config;
    }

    // Önce environment variables'dan al
    const envConfig: ConfigData = {
      supabaseUrl: process.env.VAMOS_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.VAMOS_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      backendUrl: process.env.VAMOS_BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL,
      defaultLanguage: process.env.VAMOS_DEFAULT_LANGUAGE || 'auto',
      defaultPattern: process.env.VAMOS_DEFAULT_PATTERN || '**/*.{mp4,mov,avi,mkv,webm}',
    };

    // Config dosyası varsa merge et
    let finalConfig: ConfigData;
    if (await fs.pathExists(this.CONFIG_FILE)) {
      try {
        const fileConfig = await fs.readJson(this.CONFIG_FILE);
        finalConfig = { ...envConfig, ...fileConfig };
      } catch (error) {
        console.warn(chalk.yellow('⚠️ Config dosyası okunamadı, environment variables kullanılıyor'));
        finalConfig = envConfig;
      }
    } else {
      finalConfig = envConfig;
    }

    this.config = finalConfig;
    return finalConfig;
  }

  static async saveConfig(updates: Partial<ConfigData>): Promise<void> {
    await fs.ensureDir(this.CONFIG_PATH);
    
    const currentConfig = await this.loadConfig();
    const newConfig: ConfigData = { ...currentConfig, ...updates };
    
    await fs.writeJson(this.CONFIG_FILE, newConfig, { spaces: 2 });
    this.config = newConfig;
  }

  static async getSupabaseUrl(): Promise<string> {
    const config = await this.loadConfig();
    if (!config.supabaseUrl) {
      throw new Error(
        'Supabase URL not configured. Please set VAMOS_SUPABASE_URL environment variable or run:\n' +
        'vamos config set supabaseUrl <your-supabase-url>'
      );
    }
    return config.supabaseUrl;
  }

  static async getSupabaseAnonKey(): Promise<string> {
    const config = await this.loadConfig();
    if (!config.supabaseAnonKey) {
      throw new Error(
        'Supabase Anon Key not configured. Please set VAMOS_SUPABASE_ANON_KEY environment variable or run:\n' +
        'vamos config set supabaseAnonKey <your-anon-key>'
      );
    }
    return config.supabaseAnonKey;
  }

  static async getBackendUrl(): Promise<string> {
    const config = await this.loadConfig();
    if (!config.backendUrl) {
      throw new Error(
        'Backend URL not configured. Please set VAMOS_BACKEND_URL environment variable or run:\n' +
        'vamos config set backendUrl <your-backend-url>'
      );
    }
    return config.backendUrl;
  }

  static async getDefaultLanguage(): Promise<string> {
    const config = await this.loadConfig();
    return config.defaultLanguage || 'auto';
  }

  static async getDefaultPattern(): Promise<string> {
    const config = await this.loadConfig();
    return config.defaultPattern || '**/*.{mp4,mov,avi,mkv,webm}';
  }

  static async showConfig(): Promise<void> {
    const config = await this.loadConfig();
    
    console.log(chalk.blue('\n📋 Vamos CLI Configuration:\n'));
    
    console.log(`${chalk.bold('Supabase URL:')} ${config.supabaseUrl || chalk.red('Not set')}`);
    console.log(`${chalk.bold('Supabase Anon Key:')} ${config.supabaseAnonKey ? '***' + config.supabaseAnonKey.slice(-8) : chalk.red('Not set')}`);
    console.log(`${chalk.bold('Backend URL:')} ${config.backendUrl || chalk.red('Not set')}`);
    console.log(`${chalk.bold('Default Language:')} ${config.defaultLanguage || 'auto'}`);
    console.log(`${chalk.bold('Default Pattern:')} ${config.defaultPattern || '**/*.{mp4,mov,avi,mkv,webm}'}`);
    
    const configPath = this.CONFIG_FILE;
    const hasConfigFile = await fs.pathExists(configPath);
    
    console.log(`\n${chalk.bold('Config File:')} ${hasConfigFile ? configPath : chalk.gray('Not created yet')}`);
    
    if (!config.supabaseUrl || !config.supabaseAnonKey || !config.backendUrl) {
      console.log(chalk.yellow('\n⚠️ Eksik konfigürasyon tespit edildi!'));
      console.log(chalk.blue('Environment variables ayarlayın:'));
      console.log(chalk.gray('export VAMOS_SUPABASE_URL="https://your-project.supabase.co"'));
      console.log(chalk.gray('export VAMOS_SUPABASE_ANON_KEY="your-anon-key"'));
      console.log(chalk.gray('export VAMOS_BACKEND_URL="https://api.your-domain.com"'));
    }
  }

  static async validateConfig(): Promise<void> {
    try {
      await this.getSupabaseUrl();
      await this.getSupabaseAnonKey();
      await this.getBackendUrl();
    } catch (error: any) {
      console.error(chalk.red('❌ Configuration Error:'));
      console.error(chalk.red(error.message));
      console.log(chalk.blue('\nKonfigürasyonu görüntülemek için: vamos config'));
      process.exit(1);
    }
  }

  static async setConfigValue(key: keyof ConfigData, value: string): Promise<void> {
    const updates: Partial<ConfigData> = {};
    updates[key] = value;
    
    await this.saveConfig(updates);
    console.log(chalk.green(`✅ ${key} ayarlandı: ${value}`));
  }

  static async resetConfig(): Promise<void> {
    if (await fs.pathExists(this.CONFIG_FILE)) {
      await fs.remove(this.CONFIG_FILE);
      this.config = null;
      console.log(chalk.yellow('🔄 Config dosyası silindi, environment variables kullanılacak'));
    } else {
      console.log(chalk.blue('ℹ️ Config dosyası zaten yok'));
    }
  }

  /**
   * Debugging için environment durumunu göster
   */
  static showEnvironment(): void {
    console.log(chalk.blue('\n🔧 Environment Variables:\n'));
    
    const envVars = [
      'VAMOS_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_URL',
      'VAMOS_SUPABASE_ANON_KEY', 
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'VAMOS_BACKEND_URL',
      'NEXT_PUBLIC_BACKEND_URL',
      'VAMOS_DEFAULT_LANGUAGE',
      'VAMOS_DEFAULT_PATTERN',
    ];

    envVars.forEach(envVar => {
      const value = process.env[envVar];
      if (value) {
        const maskedValue = envVar.includes('KEY') || envVar.includes('TOKEN') 
          ? '***' + value.slice(-8)
          : value;
        console.log(`${chalk.bold(envVar)}: ${maskedValue}`);
      } else {
        console.log(`${chalk.bold(envVar)}: ${chalk.red('Not set')}`);
      }
    });
  }
} 