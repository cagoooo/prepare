# 教案生成器詳細操作手冊 (Manual)

## 一、 快速開始
1. 開啟首頁。
2. 在左側欄位填入：
   - **教學領域**：例如「自然科學」、「語文」。
   - **實施年級**：例如「四年級」。
   - **單元名稱**：例如「水的循環」。
   - **額外細節**：可以輸入特定想強化的教學策略或引導重點。
3. 點擊「生成教案」按鈕。

## 二、 功能詳解

### 1. 教案內容生成
系統會自動產生 20 個核心欄位，標註「（僅供參考）」的部分為 AI 根據課綱建議產出的內容，教師可根據實際教學需求進行微調。

### 2. 引起動機、發展活動、綜合活動
生成的活動內容會自動分配時間（總計 40 分鐘），並包含具體的引導提問與教學步驟。

### 3. Word 下載
生成完成後，網頁下方會出現下載連結。點擊後可獲得格式正確的 `lesson_plan.docx`。

### 4. 郵件通知
系統會將生成好的 HTML 表格同步寄送至設定的信箱。

## 三、 設定與安全建議 (給管理者)
為了保護您的 Gemini API 金鑰與信箱密碼，請務必遵循以下規範：
1. **不要將真實密碼寫在 `app.py` 中**。
2. 使用 `.env` 檔案來管理敏感資訊。
3. 上傳至 GitHub 前，請確認 `.gitignore` 包含了 `.env`。

## 四、 關於移植到 GitHub 部署
由於此專案包含 Python 後端邏輯，GitHub Pages 的靜態空間無法直接運行。

**建議方案：**
1. 將專案推送到 GitHub。
2. 在 [Render](https://render.com) 建立一個新的 "Web Service"。
3. 連結您的 GitHub Repo，設定 Build Command 為 `pip install -r requirements.txt` (或 poetry 相關指令)，Start Command 為 `gunicorn app:app`。
4. 在 Render 的 Environment Variables 面板中設定 `GEMINI_API_KEY` 與 `MAIL_PASSWORD`。
