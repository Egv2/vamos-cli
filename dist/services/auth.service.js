"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const inquirer_1 = __importDefault(require("inquirer"));
const chalk_1 = __importDefault(require("chalk"));
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
class AuthService {
    static getSupabaseClient() {
        if (!this.supabase) {
            const supabaseUrl = process.env.VAMOS_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
            const supabaseAnonKey = process.env.VAMOS_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
            if (!supabaseUrl || !supabaseAnonKey) {
                throw new Error('Supabase credentials not found. Please set VAMOS_SUPABASE_URL and VAMOS_SUPABASE_ANON_KEY environment variables.');
            }
            this.supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseAnonKey);
        }
        return this.supabase;
    }
    static async login() {
        // Config klasörünü oluştur
        await fs_extra_1.default.ensureDir(this.CONFIG_PATH);
        console.log(chalk_1.default.blue('🔐 Vamos hesabınıza giriş yapın'));
        const { email, password } = await inquirer_1.default.prompt([
            {
                type: 'input',
                name: 'email',
                message: 'E-posta adresiniz:',
                validate: (input) => {
                    if (!input.includes('@'))
                        return 'Geçerli bir e-posta adresi girin';
                    return true;
                }
            },
            {
                type: 'password',
                name: 'password',
                message: 'Şifreniz:',
                mask: '*',
                validate: (input) => {
                    if (input.length < 6)
                        return 'Şifre en az 6 karakter olmalı';
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
            const sessionData = {
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
                user_id: data.user.id,
                email: data.user.email || '',
                expires_at: data.session.expires_at || 0
            };
            await fs_extra_1.default.writeJson(this.SESSION_FILE, sessionData);
            console.log(chalk_1.default.green(`✅ Hoş geldiniz, ${data.user.email}!`));
            console.log(chalk_1.default.gray(`User ID: ${data.user.id}`));
        }
        catch (error) {
            throw new Error(`Giriş başarısız: ${error.message}`);
        }
    }
    static async logout() {
        try {
            // Supabase'den logout
            if (this.supabase) {
                await this.supabase.auth.signOut();
            }
        }
        catch (error) {
            // Logout hatasını ignore et, session dosyasını sil
            console.warn(chalk_1.default.yellow('⚠️ Remote logout hatası, local session temizleniyor...'));
        }
        // Local session dosyasını sil
        if (await fs_extra_1.default.pathExists(this.SESSION_FILE)) {
            await fs_extra_1.default.remove(this.SESSION_FILE);
        }
        console.log(chalk_1.default.yellow('👋 Oturum kapatıldı!'));
    }
    static async isAuthenticated() {
        try {
            const token = await this.getAuthToken();
            return !!token;
        }
        catch {
            return false;
        }
    }
    static async getAuthToken() {
        if (!await fs_extra_1.default.pathExists(this.SESSION_FILE)) {
            throw new Error('Giriş yapmalısınız: vamos login');
        }
        const sessionData = await fs_extra_1.default.readJson(this.SESSION_FILE);
        // Token süresi kontrolü (5 dakika önce expire olacaksa refresh et)
        const expiresAt = sessionData.expires_at * 1000; // Convert to milliseconds
        const now = Date.now();
        const fiveMinutes = 5 * 60 * 1000;
        if (expiresAt - now < fiveMinutes) {
            // Token yenileme gerekli
            console.log(chalk_1.default.blue('🔄 Token yenileniyor...'));
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
                const newSessionData = {
                    access_token: data.session.access_token,
                    refresh_token: data.session.refresh_token,
                    user_id: data.user?.id || sessionData.user_id,
                    email: data.user?.email || sessionData.email,
                    expires_at: data.session.expires_at || 0
                };
                await fs_extra_1.default.writeJson(this.SESSION_FILE, newSessionData);
                console.log(chalk_1.default.green('✅ Token yenilendi'));
                return data.session.access_token;
            }
            catch (error) {
                // Token yenileme başarısız, session'ı sil
                await fs_extra_1.default.remove(this.SESSION_FILE);
                throw new Error('Session süresi dolmuş, tekrar giriş yapın: vamos login');
            }
        }
        return sessionData.access_token;
    }
    static async getUserId() {
        if (!await fs_extra_1.default.pathExists(this.SESSION_FILE)) {
            throw new Error('Giriş yapmalısınız: vamos login');
        }
        const sessionData = await fs_extra_1.default.readJson(this.SESSION_FILE);
        return sessionData.user_id;
    }
    static async getUserEmail() {
        if (!await fs_extra_1.default.pathExists(this.SESSION_FILE)) {
            throw new Error('Giriş yapmalısınız: vamos login');
        }
        const sessionData = await fs_extra_1.default.readJson(this.SESSION_FILE);
        return sessionData.email;
    }
    static async getCurrentUser() {
        try {
            const token = await this.getAuthToken();
            const supabase = this.getSupabaseClient();
            const { data: { user }, error } = await supabase.auth.getUser(token);
            if (error || !user) {
                return null;
            }
            return user;
        }
        catch {
            return null;
        }
    }
    static async validateAuth() {
        if (!await this.isAuthenticated()) {
            console.log(chalk_1.default.red('❌ Önce giriş yapmalısınız:'));
            console.log(chalk_1.default.blue('   vamos login'));
            process.exit(1);
        }
    }
}
exports.AuthService = AuthService;
_a = AuthService;
AuthService.CONFIG_PATH = path_1.default.join(os_1.default.homedir(), '.vamos-cli');
AuthService.SESSION_FILE = path_1.default.join(_a.CONFIG_PATH, 'session.json');
AuthService.supabase = null;
