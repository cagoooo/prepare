// API 端點切換：使用 Firebase 2nd Gen 獨立功能網址 (解決 CORS 與網址代溝)
const GENERATE_PLAN_URL = 'https://generateplan-gm5nfzzzwa-de.a.run.app';
const DOWNLOAD_DOCX_URL = 'https://downloaddocx-gm5nfzzzwa-de.a.run.app';

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
            body: JSON.stringify({ subject, grade, unit, details }),
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
                    downloadBtn.onclick = () => downloadDocx(data.html_content);
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
            });
    });
});

function downloadDocx(htmlContent) {
    fetch(DOWNLOAD_DOCX_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ html_content: htmlContent }),
    })
        .then(response => response.blob())
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = 'lesson_plan.docx';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
        })
        .catch(error => {
            console.error('Error downloading file:', error);
        });
}
