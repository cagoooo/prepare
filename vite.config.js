import { defineConfig } from 'vite';

export default defineConfig({
    // 為了 GitHub Pages 部署，必須設定 base 為 './'，解決子目錄相對路徑問題
    base: './',
});
