import { initServiceWorker } from './sw-update.js';
import { DAILY_LIMIT, getIdToken, getSignedInUser, loginWithGoogle, logout, onUserChange } from './auth.js';

initServiceWorker();

// API 端點切換：使用 Firebase 2nd Gen 獨立功能網址 (解決 CORS 與網址代溝)
const GENERATE_PLAN_URL = 'https://asia-east1-teacher-c571b.cloudfunctions.net/generatePlan';
const DOWNLOAD_DOCX_URL = 'https://asia-east1-teacher-c571b.cloudfunctions.net/downloadDocx';
const TURNSTILE_SITE_KEY = '0x4AAAAAAFIt_ajnZaQP0S-J';

let turnstileToken = null;
let turnstileWidgetId = null;

function loadTurnstile() {
    if (window.turnstile?.render) return Promise.resolve(window.turnstile);

    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = false;
        script.onload = () => {
            if (!window.turnstile?.render) {
                reject(new Error('Cloudflare 安全驗證載入失敗。'));
                return;
            }
            resolve(window.turnstile);
        };
        script.onerror = () => reject(new Error('無法載入 Cloudflare 安全驗證，請檢查網路後重新整理。'));
        document.head.appendChild(script);
    });
}

// ─── 今日剩餘次數（以伺服器回傳為準；同一天同一帳號先記在瀏覽器顯示用） ───
function taipeiToday() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function quotaKey(user) {
    return `prepare-quota-${user.uid}-${taipeiToday()}`;
}

function readRemaining(user) {
    try {
        const value = localStorage.getItem(quotaKey(user));
        // 上限調降後，今天稍早存下的剩餘次數可能比新上限大，顯示時以新上限為準
        return value === null ? null : Math.min(Number(value), DAILY_LIMIT);
    } catch (_) {
        return null;
    }
}

function saveRemaining(remaining) {
    const user = getSignedInUser();
    if (!user || typeof remaining !== 'number' || Number.isNaN(remaining)) return;
    try { localStorage.setItem(quotaKey(user), String(remaining)); } catch (_) { }
    renderQuota(user);
}

function renderQuota(user) {
    const el = document.getElementById('auth-quota');
    if (!el || !user) return;
    const remaining = readRemaining(user);
    el.textContent = remaining === null
        ? `今日最多 ${DAILY_LIMIT} 次`
        : `今日剩餘 ${remaining} / ${DAILY_LIMIT} 次`;
    el.classList.toggle('is-empty', remaining === 0);
}

function showAuthMessage(text, isError = false) {
    const el = document.getElementById('auth-message');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('is-error', !!isError);
}

function setupAuthBar() {
    const signedOut = document.getElementById('auth-signed-out');
    const signedIn = document.getElementById('auth-signed-in');
    const nameEl = document.getElementById('auth-user-name');
    const loginBtn = document.getElementById('google-login-btn');
    const logoutBtn = document.getElementById('google-logout-btn');

    onUserChange(user => {
        signedOut.hidden = !!user;
        signedIn.hidden = !user;
        if (user) {
            nameEl.textContent = user.displayName || user.email || 'Google 使用者';
            renderQuota(user);
            showAuthMessage('');
        }
    });

    loginBtn.addEventListener('click', async () => {
        loginBtn.disabled = true;
        loginBtn.textContent = '登入中…';
        showAuthMessage('');
        try {
            await loginWithGoogle();
        } catch (error) {
            showAuthMessage(error.message, true);
        } finally {
            loginBtn.disabled = false;
            loginBtn.textContent = '使用 Google 帳號登入';
        }
    });

    logoutBtn.addEventListener('click', () => {
        logout().catch(() => { });
    });
}

/** 把後端錯誤轉成老師看得懂的中文 */
function friendlyPlanError(status, data) {
    if (status === 401) {
        return (data && data.code === 'auth_invalid')
            ? '登入已過期，請按「登出」後重新用 Google 帳號登入。'
            : '請先用 Google 帳號登入才能使用（每人每天 3 次）。';
    }
    if (status === 403) return (data && data.error) || '人機驗證未通過，請重新完成安全驗證後再試。';
    if (status === 429) {
        return (data && data.code === 'daily_limit')
            ? '今天的 3 次已用完，明天（台北時間午夜後）再來。'
            : (data && data.error) || '使用次數太頻繁，請稍後再試。';
    }
    return (data && data.error) || `教案產生失敗（HTTP ${status}），請稍後再試。`;
}

function resetTurnstile() {
    turnstileToken = null;
    if (window.turnstile && turnstileWidgetId !== null) {
        try {
            window.turnstile.reset(turnstileWidgetId);
        } catch (error) {
            console.warn('Turnstile reset failed:', error);
        }
    }
    const status = document.getElementById('turnstile-status');
    if (status) status.textContent = '請完成安全驗證後再產生教案。';
}

document.addEventListener('DOMContentLoaded', function () {
    // 解決開發環境緩存問題：註銷所有 Service Worker (僅限 localhost)
    if ('serviceWorker' in navigator) {
        if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
            navigator.serviceWorker.getRegistrations().then(function (registrations) {
                for (let registration of registrations) {
                    registration.unregister();
                    console.log('Service Worker 已註銷，確保載入最新版本 (localhost環境)。');
                }
            });
        }
    }

    const form = document.getElementById('lesson-plan-form');
    const resultDiv = document.getElementById('result');
    const turnstileContainer = document.getElementById('turnstile-widget');
    const turnstileStatus = document.getElementById('turnstile-status');

    setupAuthBar();

    loadTurnstile()
        .then(turnstile => {
            turnstileWidgetId = turnstile.render(turnstileContainer, {
                sitekey: TURNSTILE_SITE_KEY,
                action: 'generate_plan',
                theme: 'light',
                size: 'flexible',
                callback: token => {
                    turnstileToken = token;
                    turnstileStatus.textContent = '安全驗證完成，可以產生教案。';
                },
                'expired-callback': () => {
                    turnstileToken = null;
                    turnstileStatus.textContent = '驗證已逾時，請重新完成安全驗證。';
                },
                'error-callback': () => {
                    turnstileToken = null;
                    turnstileStatus.textContent = '安全驗證暫時無法使用，請重新整理頁面後再試。';
                },
            });
            turnstileStatus.textContent = '請完成安全驗證後再產生教案。';
        })
        .catch(error => {
            console.error('Turnstile initialization failed:', error);
            turnstileStatus.textContent = error.message;
        });

    let progressInterval;

    function updateProgress(percent) {
        const fill = document.getElementById('progress-fill');
        const text = document.getElementById('progress-percent');
        if (fill && text) {
            fill.style.width = percent + '%';
            text.textContent = Math.round(percent) + '%';
        }
    }

    function startSmartProgress() {
        let currentProgress = 0;
        updateProgress(0);

        // 模擬進度邏輯：前快後慢
        progressInterval = setInterval(() => {
            if (currentProgress < 30) {
                currentProgress += Math.random() * 5; // 初期快速
            } else if (currentProgress < 70) {
                currentProgress += Math.random() * 2; // 中期穩定
            } else if (currentProgress < 95) {
                currentProgress += Math.random() * 0.5; // 後期緩慢 (等待 API)
            }

            if (currentProgress > 98) currentProgress = 98;
            updateProgress(currentProgress);
        }, 300);
    }

    function finishProgress() {
        clearInterval(progressInterval);
        updateProgress(100);
        setTimeout(() => {
            document.getElementById('progress-container').style.display = 'none';
        }, 500);
    }

    form.addEventListener('submit', function (e) {
        e.preventDefault();

        // ① 必須先用 Google 帳號登入
        if (!getSignedInUser()) {
            showAuthMessage('🔒 請先用 Google 帳號登入才能使用（每人每天 3 次）', true);
            document.getElementById('auth-bar').scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        if (!turnstileToken) {
            turnstileStatus.textContent = '請先完成安全驗證，再產生教案。';
            turnstileContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        const submitButton = form.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.style.opacity = '0.5';
        submitButton.style.cursor = 'not-allowed';

        const subject = document.getElementById('subject').value;
        const grade = document.getElementById('grade').value;
        const unit = document.getElementById('unit').value;
        const details = document.getElementById('details').value;

        // 顯示進度區域，隱藏結果區域
        const progressContainer = document.getElementById('progress-container');
        if (progressContainer) {
            progressContainer.style.display = 'block';
            // 自動捲動至進度條，提升 UX
            progressContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        if (resultDiv) {
            resultDiv.style.display = 'none';
            resultDiv.innerHTML = '';
        }

        startSmartProgress();

        const sentTurnstileToken = turnstileToken;
        getIdToken()
            .then(idToken => {
                if (!idToken) {
                    const err = new Error('請先用 Google 帳號登入才能使用（每人每天 3 次）。');
                    err.friendly = true;
                    throw err;
                }
                return fetch(GENERATE_PLAN_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${idToken}`,
                    },
                    body: JSON.stringify({ subject, grade, unit, details, turnstileToken: sentTurnstileToken }),
                });
            })
            .then(async response => {
                let data = {};
                try { data = await response.json(); } catch (_) { }
                if (typeof data.remaining === 'number') saveRemaining(data.remaining);
                if (!response.ok || !data.success) {
                    return { success: false, error: friendlyPlanError(response.status, data) };
                }
                return data;
            })
            .then(data => {
                finishProgress();
                if (data.success) {
                    // Parse the HTML content
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(data.plan, 'text/html');

                    // Find the title and apply the new class
                    const title = doc.querySelector('h3');
                    if (title) {
                        title.classList.add('lesson-plan-title');
                    }
                    // Set the innerHTML of the resultDiv
                    resultDiv.innerHTML = doc.body.innerHTML;
                    resultDiv.style.display = 'block';
                    // 自動捲動至結果區域，提升 UX
                    resultDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });

                    // Add download button
                    const downloadBtn = document.createElement('button');
                    downloadBtn.textContent = '下載 Word 檔案';
                    downloadBtn.id = 'downloadBtn';
                    downloadBtn.onclick = () => downloadDocx(data.html_content, { subject, grade, unit });
                    resultDiv.appendChild(downloadBtn);

                } else {
                    resultDiv.style.display = 'block';
                    resultDiv.innerHTML = '';
                    const errorP = document.createElement('p');
                    errorP.className = 'plan-error';
                    errorP.textContent = `生成教案時出錯：${data.error}`;
                    resultDiv.appendChild(errorP);
                }
                submitButton.disabled = false;
                submitButton.style.opacity = '1';
                submitButton.style.cursor = 'pointer';
            })
            .catch(error => {
                finishProgress();
                resultDiv.style.display = 'block';
                resultDiv.innerHTML = '';
                const errorP = document.createElement('p');
                errorP.className = 'plan-error';
                errorP.textContent = error && error.friendly
                    ? error.message
                    : '連線失敗，請確認網路後再試一次。';
                resultDiv.appendChild(errorP);
                submitButton.disabled = false;
                submitButton.style.opacity = '1';
                submitButton.style.cursor = 'pointer';
            })
            .finally(resetTurnstile);
    });
});

function buildLessonPlanFilename(lessonInfo = {}) {
    const safePart = value => String(value ?? '')
        .normalize('NFC')
        .replace(/[<>:"/\\|?*\u0000-\u001F\u007F]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^[_. ]+|[_. ]+$/g, '')
        .slice(0, 60)
        .replace(/[_. ]+$/g, '');
    const parts = [lessonInfo.grade, lessonInfo.subject, lessonInfo.unit].map(safePart).filter(Boolean);
    return parts.length ? `${parts.join('_')}_教案.docx` : '教案.docx';
}

function downloadDocx(htmlContent, lessonInfo = {}) {
    if (!turnstileToken) {
        const status = document.getElementById('turnstile-status');
        const widget = document.getElementById('turnstile-widget');
        if (status) status.textContent = '請先完成安全驗證，再下載 Word 檔案。';
        if (widget) widget.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }

    const token = turnstileToken;
    const progressContainer = document.getElementById('progress-container');
    const loadingText = progressContainer.querySelector('.loading-text');
    const originalText = loadingText.textContent;

    if (progressContainer) {
        loadingText.textContent = '正在準備您的 Word 檔案，請稍候...';
        progressContainer.style.display = 'block';
        progressContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // 重用進度條邏輯
    let currentProgress = 0;
    const interval = setInterval(() => {
        if (currentProgress < 90) {
            currentProgress += Math.random() * 10;
            const fill = document.getElementById('progress-fill');
            const text = document.getElementById('progress-percent');
            if (fill && text) {
                fill.style.width = currentProgress + '%';
                text.textContent = Math.round(currentProgress) + '%';
            }
        }
    }, 200);

    fetch(DOWNLOAD_DOCX_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ html_content: htmlContent, turnstileToken: token }),
    })
        .then(async response => {
            if (!response.ok) {
                let errorMessage = `下載失敗（HTTP ${response.status}）`;
                try {
                    const errorData = await response.json();
                    if (errorData.error) errorMessage += `：${errorData.error}`;
                } catch (_) {
                    // 錯誤回應不是 JSON 時保留 HTTP 狀態訊息。
                }
                throw new Error(errorMessage);
            }

            const contentType = response.headers.get('content-type') || '';
            if (!contentType.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document')) {
                throw new Error('伺服器回傳內容不是有效的 Word 檔案。');
            }

            return response.blob();
        })
        .then(blob => {
            clearInterval(interval);
            const fill = document.getElementById('progress-fill');
            const text = document.getElementById('progress-percent');
            if (fill && text) {
                fill.style.width = '100%';
                text.textContent = '100%';
            }

            setTimeout(() => {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = buildLessonPlanFilename(lessonInfo);
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                progressContainer.style.display = 'none';
                loadingText.textContent = originalText; // 恢復原文字
            }, 500);
        })
        .catch(error => {
            clearInterval(interval);
            console.error('Error downloading file:', error);
            if (progressContainer) progressContainer.style.display = 'none';
            loadingText.textContent = originalText;
            alert(error.message || '下載失敗，請稍後再試。');
        })
        .finally(resetTurnstile);
}
