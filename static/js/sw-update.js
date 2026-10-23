// Service Worker 註冊＋「有新版本」提示。
// 只在正式環境註冊；localhost 由 script.js 負責註銷舊 SW，避免開發時被快取干擾。
// 版本號格式「run number-commit hash」，顯示提示前先比對 waiting 與 active 的版本，
// 避免 CDN 殘留舊檔或同一 commit 重新部署造成「按了更新又跳出來」。

/* global __APP_VERSION__ */
const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0-dev';
const ACK_KEY = 'prepare-sw-ack-version';
const DISMISS_KEY = 'prepare-sw-dismissed-version';
const REFRESHED_AT_KEY = 'prepare-sw-refreshed-at';
const CHECK_INTERVAL = 30 * 60 * 1000;

let registration = null;
let updateRequested = false;
let lastAnnounced = '';

const isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

function session(action, key, value) {
    try {
        if (action === 'get') return sessionStorage.getItem(key);
        sessionStorage.setItem(key, value);
    } catch { /* 無痕模式等情況讀不到也沒關係 */ }
    return null;
}

function getWorkerVersion(worker) {
    return new Promise((resolve) => {
        if (!worker) { resolve(null); return; }
        try {
            const channel = new MessageChannel();
            const timer = setTimeout(() => resolve(null), 1500);
            channel.port1.onmessage = (event) => {
                clearTimeout(timer);
                resolve(typeof event.data?.version === 'string' ? event.data.version : null);
            };
            worker.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
        } catch {
            resolve(null);
        }
    });
}

function parseVersion(version) {
    const match = /^(\d+)-([0-9a-z]+)$/i.exec(version || '');
    return match ? { run: Number(match[1]), hash: match[2] } : null;
}

// waiting 比 active 新才回 true：run number 較大，或相同 run number 但 commit 不同
export function isNewerVersion(candidate, current) {
    if (!candidate || !current) return true; // 查不到版本時寧可提示，不擋真更新
    if (candidate === current) return false;
    const c = parseVersion(candidate);
    const a = parseVersion(current);
    if (!c || !a) return true;
    if (c.run !== a.run) return c.run > a.run;
    return c.hash !== a.hash;
}

function inSilencePeriod() {
    const at = Number(session('get', REFRESHED_AT_KEY) || 0);
    return Date.now() - at < 15000;
}

async function maybeAnnounce(worker) {
    if (!worker || !navigator.serviceWorker.controller) return; // 第一次安裝不提示
    const [waitingVersion, activeVersion] = await Promise.all([
        getWorkerVersion(worker),
        getWorkerVersion(registration?.active || navigator.serviceWorker.controller),
    ]);
    if (!isNewerVersion(waitingVersion, activeVersion)) return; // 假更新：不提示、也不動它
    const target = waitingVersion || 'unknown';
    if (inSilencePeriod()) return;
    if (target === lastAnnounced) return;
    if (session('get', ACK_KEY) === target || session('get', DISMISS_KEY) === target) return;
    lastAnnounced = target;
    showUpdateBar(target);
}

function applyUpdate() {
    // 點擊當下才查 waiting，確保拿到的是最新的那一顆
    const waiting = registration?.waiting;
    session('set', REFRESHED_AT_KEY, String(Date.now()));
    if (lastAnnounced) session('set', ACK_KEY, lastAnnounced);
    updateRequested = true;
    const button = document.getElementById('sw-update-go');
    if (button) {
        button.disabled = true;
        button.textContent = '更新中…';
    }
    if (waiting) {
        waiting.postMessage({ type: 'SKIP_WAITING' });
        // 手機或多分頁接手較慢時的保險：8 秒後只重新整理，不清快取
        setTimeout(() => location.reload(), 8000);
    } else {
        location.reload();
    }
}

function injectStyles() {
    if (document.getElementById('sw-update-style')) return;
    const style = document.createElement('style');
    style.id = 'sw-update-style';
    style.textContent = `
#sw-update-bar{position:fixed;z-index:10000;left:50%;top:max(14px,env(safe-area-inset-top));transform:translateX(-50%);
  width:max-content;max-width:calc(100vw - 24px);box-sizing:border-box;display:flex;align-items:center;gap:12px;
  padding:10px 10px 10px 18px;border-radius:999px;background:rgba(255,255,255,.96);color:#221f66;
  box-shadow:0 10px 30px rgba(34,31,102,.28);border:2px solid #e73c7e;font-family:'Microsoft JhengHei',sans-serif;
  animation:sw-in .35s ease-out}
#sw-update-bar .sw-msg{display:flex;flex-direction:column;line-height:1.35}
#sw-update-bar .sw-title{font-weight:700;font-size:1rem;white-space:nowrap}
#sw-update-bar .sw-desc{display:none;font-size:.88rem;color:#555}
#sw-update-go{border:0;border-radius:999px;padding:10px 18px;font-size:.95rem;font-weight:700;cursor:pointer;color:#fff;
  background:linear-gradient(90deg,#e73c7e,#ee7752);white-space:nowrap;min-height:44px}
#sw-update-go:disabled{opacity:.7;cursor:wait}
#sw-update-x{border:0;background:transparent;color:#666;font-size:1.25rem;width:44px;height:44px;border-radius:50%;cursor:pointer}
#sw-update-x:hover{background:#f3eef6}
#sw-update-go:focus-visible,#sw-update-x:focus-visible{outline:3px solid #23a6d5;outline-offset:2px}
@keyframes sw-in{from{opacity:0;transform:translate(-50%,-12px)}to{opacity:1;transform:translate(-50%,0)}}
@media (max-width:560px){
  #sw-update-bar{left:12px;right:12px;top:auto;bottom:max(12px,env(safe-area-inset-bottom));transform:none;width:auto;
    display:grid;grid-template-columns:1fr auto;grid-template-areas:"msg x" "go go";gap:10px;border-radius:18px;padding:14px;
    animation-name:sw-up}
  #sw-update-bar .sw-msg{grid-area:msg}
  #sw-update-bar .sw-title{white-space:normal}
  #sw-update-bar .sw-desc{display:block}
  #sw-update-x{grid-area:x}
  #sw-update-go{grid-area:go;width:100%;min-height:48px;border-radius:14px;font-size:1rem}
  @keyframes sw-up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
}
@media (prefers-reduced-motion:reduce){#sw-update-bar{animation:none}}`;
    document.head.appendChild(style);
}

function showUpdateBar(version) {
    if (document.getElementById('sw-update-bar')) return;
    injectStyles();
    const bar = document.createElement('div');
    bar.id = 'sw-update-bar';
    bar.setAttribute('role', 'status');
    bar.setAttribute('aria-live', 'polite');
    bar.innerHTML = `
        <div class="sw-msg">
            <span class="sw-title">🎉 備課小幫手有新版本了！</span>
            <span class="sw-desc">重新整理就能使用最新功能；尚未下載的教案請先存好喔。</span>
        </div>
        <button type="button" id="sw-update-go">重新整理載入最新版</button>
        <button type="button" id="sw-update-x" aria-label="稍後再說">✕</button>`;
    document.body.appendChild(bar);
    bar.querySelector('#sw-update-go').addEventListener('click', applyUpdate);
    bar.querySelector('#sw-update-x').addEventListener('click', () => {
        session('set', DISMISS_KEY, version);
        bar.remove();
    });
}

function watchRegistration(reg) {
    registration = reg;
    if (reg.waiting) maybeAnnounce(reg.waiting);
    reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
            if (worker.state === 'installed') maybeAnnounce(worker);
        });
    });
}

function checkForUpdate() {
    registration?.update().catch(() => {});
}

export function initServiceWorker() {
    // 網址加 ?swdemo=1 可直接預覽通知列樣式
    if (new URLSearchParams(location.search).has('swdemo')) {
        document.addEventListener('DOMContentLoaded', () => showUpdateBar('demo'));
        if (document.readyState !== 'loading') showUpdateBar('demo');
    }
    if (!('serviceWorker' in navigator) || isLocalhost || !import.meta.env.PROD) return;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        // 只有使用者按了「重新整理」才重載；第一次安裝接管時不重載
        if (!updateRequested) return;
        updateRequested = false;
        location.reload();
    });

    const base = import.meta.env.BASE_URL;
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base, updateViaCache: 'none' })
        .then((reg) => {
            watchRegistration(reg);
            setInterval(checkForUpdate, CHECK_INTERVAL);
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') checkForUpdate();
            });
            window.addEventListener('online', checkForUpdate);
        })
        .catch((error) => console.warn('Service Worker 註冊失敗：', error));

    console.info(`備課小幫手版本：${APP_VERSION}`);
}
