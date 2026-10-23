import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// 版本號格式：「CI run number-commit hash」，同一個 commit 重跑 workflow 版本不變，
// 才不會讓使用者看到「假更新」通知。本機 build 沒有 run number 時用 0。
function resolveBuildVersion() {
    if (process.env.BUILD_VERSION) return process.env.BUILD_VERSION;
    let sha = 'local';
    try {
        sha = execSync('git rev-parse --short=12 HEAD').toString().trim();
    } catch { /* 非 git 環境 */ }
    return `0-${sha}`;
}

const BUILD_VERSION = resolveBuildVersion();

// OG 圖片網址帶內容 hash：圖片有改才換網址，FB / LINE 才會重抓新圖
const ogPath = resolve(__dirname, 'public/og-image.png');
const OG_VERSION = existsSync(ogPath)
    ? createHash('sha1').update(readFileSync(ogPath)).digest('hex').slice(0, 8)
    : '1';

function buildVersionPlugin() {
    let outDir = 'dist';
    return {
        name: 'build-version',
        configResolved(config) {
            outDir = resolve(config.root, config.build.outDir);
        },
        transformIndexHtml(html) {
            return html
                .replaceAll('__BUILD_VERSION__', BUILD_VERSION)
                .replaceAll('__OG_VERSION__', OG_VERSION);
        },
        closeBundle() {
            // public/ 的檔案是原樣複製，build 完再把 sw.js 裡的版本號換掉
            const swPath = resolve(outDir, 'sw.js');
            if (existsSync(swPath)) {
                writeFileSync(swPath, readFileSync(swPath, 'utf8').replaceAll('__BUILD_VERSION__', BUILD_VERSION));
            }
        },
    };
}

export default defineConfig({
    // 為了 GitHub Pages 部署，建議設定明確的子目錄路徑 `/prepare/`
    base: '/prepare/',
    define: {
        __APP_VERSION__: JSON.stringify(BUILD_VERSION),
    },
    plugins: [buildVersionPlugin()],
});
