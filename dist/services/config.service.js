"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigService = void 0;
const chalk_1 = __importDefault(require("chalk"));
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const dotenv_1 = require("dotenv");
class ConfigService {
    static async loadConfig() {
        if (this.config) {
            return this.config;
        }
        // Önce environment variables'dan al
        const envConfig = {
            supabaseUrl: process.env.VAMOS_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
            supabaseAnonKey: process.env.VAMOS_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
            backendUrl: process.env.VAMOS_BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL,
            defaultLanguage: process.env.VAMOS_DEFAULT_LANGUAGE || 'auto',
            defaultPattern: process.env.VAMOS_DEFAULT_PATTERN || '**/*.{mp4,mov,avi,mkv,webm}',
        };
        // Config dosyası varsa merge et
        let finalConfig;
        if (await fs_extra_1.default.pathExists(this.CONFIG_FILE)) {
            try {
                const fileConfig = await fs_extra_1.default.readJson(this.CONFIG_FILE);
                finalConfig = { ...envConfig, ...fileConfig };
            }
            catch (error) {
                console.warn(chalk_1.default.yellow('⚠️ Config dosyası okunamadı, environment variables kullanılıyor'));
                finalConfig = envConfig;
            }
        }
        else {
            finalConfig = envConfig;
        }
        this.config = finalConfig;
        return finalConfig;
    }
    static async saveConfig(updates) {
        await fs_extra_1.default.ensureDir(this.CONFIG_PATH);
        const currentConfig = await this.loadConfig();
        const newConfig = { ...currentConfig, ...updates };
        await fs_extra_1.default.writeJson(this.CONFIG_FILE, newConfig, { spaces: 2 });
        this.config = newConfig;
    }
    static async getSupabaseUrl() {
        const config = await this.loadConfig();
        if (!config.supabaseUrl) {
            throw new Error('Supabase URL not configured. Please set VAMOS_SUPABASE_URL environment variable or run:\n' +
                'vamos config set supabaseUrl <your-supabase-url>');
        }
        return config.supabaseUrl;
    }
    static async getSupabaseAnonKey() {
        const config = await this.loadConfig();
        if (!config.supabaseAnonKey) {
            throw new Error('Supabase Anon Key not configured. Please set VAMOS_SUPABASE_ANON_KEY environment variable or run:\n' +
                'vamos config set supabaseAnonKey <your-anon-key>');
        }
        return config.supabaseAnonKey;
    }
    static async getBackendUrl() {
        const config = await this.loadConfig();
        if (!config.backendUrl) {
            throw new Error('Backend URL not configured. Please set VAMOS_BACKEND_URL environment variable or run:\n' +
                'vamos config set backendUrl <your-backend-url>');
        }
        return config.backendUrl;
    }
    static async getDefaultLanguage() {
        const config = await this.loadConfig();
        return config.defaultLanguage || 'auto';
    }
    static async getDefaultPattern() {
        const config = await this.loadConfig();
        return config.defaultPattern || '**/*.{mp4,mov,avi,mkv,webm}';
    }
    static async showConfig() {
        const config = await this.loadConfig();
        console.log(chalk_1.default.blue('\n📋 Vamos CLI Configuration:\n'));
        console.log(`${chalk_1.default.bold('Supabase URL:')} ${config.supabaseUrl || chalk_1.default.red('Not set')}`);
        console.log(`${chalk_1.default.bold('Supabase Anon Key:')} ${config.supabaseAnonKey ? '***' + config.supabaseAnonKey.slice(-8) : chalk_1.default.red('Not set')}`);
        console.log(`${chalk_1.default.bold('Backend URL:')} ${config.backendUrl || chalk_1.default.red('Not set')}`);
        console.log(`${chalk_1.default.bold('Default Language:')} ${config.defaultLanguage || 'auto'}`);
        console.log(`${chalk_1.default.bold('Default Pattern:')} ${config.defaultPattern || '**/*.{mp4,mov,avi,mkv,webm}'}`);
        const configPath = this.CONFIG_FILE;
        const hasConfigFile = await fs_extra_1.default.pathExists(configPath);
        console.log(`\n${chalk_1.default.bold('Config File:')} ${hasConfigFile ? configPath : chalk_1.default.gray('Not created yet')}`);
        if (!config.supabaseUrl || !config.supabaseAnonKey || !config.backendUrl) {
            console.log(chalk_1.default.yellow('\n⚠️ Eksik konfigürasyon tespit edildi!'));
            console.log(chalk_1.default.blue('Environment variables ayarlayın:'));
            console.log(chalk_1.default.gray('export VAMOS_SUPABASE_URL="https://your-project.supabase.co"'));
            console.log(chalk_1.default.gray('export VAMOS_SUPABASE_ANON_KEY="your-anon-key"'));
            console.log(chalk_1.default.gray('export VAMOS_BACKEND_URL="https://api.your-domain.com"'));
        }
    }
    static async validateConfig() {
        try {
            await this.getSupabaseUrl();
            await this.getSupabaseAnonKey();
            await this.getBackendUrl();
        }
        catch (error) {
            console.error(chalk_1.default.red('❌ Configuration Error:'));
            console.error(chalk_1.default.red(error.message));
            console.log(chalk_1.default.blue('\nKonfigürasyonu görüntülemek için: vamos config'));
            process.exit(1);
        }
    }
    static async setConfigValue(key, value) {
        const updates = {};
        updates[key] = value;
        await this.saveConfig(updates);
        console.log(chalk_1.default.green(`✅ ${key} ayarlandı: ${value}`));
    }
    static async resetConfig() {
        if (await fs_extra_1.default.pathExists(this.CONFIG_FILE)) {
            await fs_extra_1.default.remove(this.CONFIG_FILE);
            this.config = null;
            console.log(chalk_1.default.yellow('🔄 Config dosyası silindi, environment variables kullanılacak'));
        }
        else {
            console.log(chalk_1.default.blue('ℹ️ Config dosyası zaten yok'));
        }
    }
    /**
     * Debugging için environment durumunu göster
     */
    static showEnvironment() {
        console.log(chalk_1.default.blue('\n🔧 Environment Variables:\n'));
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
                console.log(`${chalk_1.default.bold(envVar)}: ${maskedValue}`);
            }
            else {
                console.log(`${chalk_1.default.bold(envVar)}: ${chalk_1.default.red('Not set')}`);
            }
        });
    }
}
exports.ConfigService = ConfigService;
_a = ConfigService;
ConfigService.CONFIG_PATH = path_1.default.join(os_1.default.homedir(), '.vamos-cli');
ConfigService.CONFIG_FILE = path_1.default.join(_a.CONFIG_PATH, 'config.json');
ConfigService.config = null;
(() => {
    // .env dosyasını yükle (project root'da)
    const envPaths = [
        path_1.default.join(process.cwd(), '.env'),
        path_1.default.join(process.cwd(), '../../.env'), // CLI apps/ içinde ise root'daki .env
        path_1.default.join(__dirname, '../../../.env'), // Built version için
    ];
    for (const envPath of envPaths) {
        if (fs_extra_1.default.existsSync(envPath)) {
            (0, dotenv_1.config)({ path: envPath });
            break;
        }
    }
})();
