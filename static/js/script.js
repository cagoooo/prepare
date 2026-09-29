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
        script.async = true;
        script.defer = true;
        script.onload = () => {
            if (!window.turnstile?.ready) {
                reject(new Error('Cloudflare 安全驗證載入失敗。'));
                return;
            }
            window.turnstile.ready(() => resolve(window.turnstile));
        };
        script.onerror = () => reject(new Error('無法載入 Cloudflare 安全驗證，請檢查網路後重新整理。'));
        document.head.appendChild(script);
    });
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

        fetch(GENERATE_PLAN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ subject, grade, unit, details, turnstileToken }),
        })
            .then(response => response.json())
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
                    resultDiv.innerHTML = `<p>生成教案時出錯：${data.error}</p>`;
                }
                submitButton.disabled = false;
                submitButton.style.opacity = '1';
                submitButton.style.cursor = 'pointer';
            })
            .catch(error => {
                finishProgress();
                resultDiv.style.display = 'block';
                resultDiv.innerHTML = `<p>請求出錯：${error}</p>`;
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
