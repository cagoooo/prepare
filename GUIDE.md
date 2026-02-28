# 🎓 十二年國教教案生成器：全面使用指南

本專案是一個基於 Google Gemini AI 技術的自動化教案生成系統，旨在減輕台灣教師的行政負擔，快速產出符合課綱格式的教學活動設計。

---

## 📂 1. 專案目錄結構分析

```text
h:/prepare/
├── app.py              # Flask 核心後端：處理 AI 生成、Word 轉換與郵件發送
├── .env                # 環境變數 (機密資訊：API Key, 郵件密碼)
├── pyproject.toml      # Poetry 依賴管理文件
├── static/             # 靜態資源
│   ├── css/styles.css  # 全局樣式 (含 Aurora 漸層與 Glassmorphism 設計)
│   ├── js/script.js    # 前端邏輯 (含智慧進度條、自動捲動與下載處理)
│   └── images/         # 圖片資源 (學校 Logo 等)
├── templates/          # HTML 模板
│   └── index.html      # 主入口網頁 (RWD 響應式結構)
├── manual.md           # 快速操作手冊
└── 教案範例格式_DOCX/   # 生成 Word 所需的參考格式 (範例)
```

---

## 🛠️ 2. 本地開發設定

### 步驟 A：環境初始化
建議使用 Python 3.10+ 環境。

1. **安裝依賴**：
   ```bash
   pip install flask google-genai python-docx beautifulsoup4 flask-mail python-dotenv
   ```
2. **設定環境變數**：
   請在根目錄建立 `.env` 檔案（或修改 `.env.example`）：
   ```env
   GEMINI_API_KEY=你的_Google_Gemini_API_Key
   MAIL_PASSWORD=你的_Gmail_應用程式密碼
   ```

### 步驟 B：啟動服務
```bash
python app.py
```
訪問網址：`http://127.0.0.1:8080`

---

## ✨ 3. 核心功能說明

### 🌈 視覺化智慧進度條 (Aurora UI)
- **智慧模擬**：點擊生成後，系統會自動捲動至視窗中心並啟動「前快後慢」的擬真進度顯示。
- **極光動畫**：採用繽紛的彩虹漸層動畫，提升等待時的心理舒適度。

### 🤖 AI 教案生成邏輯
- 系統將教師輸入的「領域、年級、單元」轉化為專業 Prompt，調配 Gemini 1.5 Flash 產生 20 個項目的完整教學活動。
- 自動生成引起動機、發展活動與綜合活動。

### 📄 文件轉換與下載
- **Word 引擎**：利用 `python-docx` 於後端將 HTML 結果精準轉譯為符合公務格式的 `.docx` 檔案。
- **自動標記**：AI 產出的內容會自動標註「（僅供參考）」，提醒老師進行專業微調。

---

## 🔒 4. 重要安全規範

> [!CAUTION]
> **嚴禁洩漏 API Key**
> 1. 請確認 `.gitignore` 檔案包含 `.env`。
> 2. 永遠不要在 `app.py` 中硬編碼真實密碼。
> 3. 若要推送到 GitHub，請使用 **Repository Secrets** 來管理這些變數。

---

## 🚀 5. GitHub 部署建議報告

此專案包含 Python 後端，無法直接使用 GitHub Pages (僅限靜態)。以下是推薦的專業部署路徑：

### 推薦方案：Google Cloud Run (極致彈性)
- **原因**：完全與目前 `app.py` 的容器化風格契合。
- **流程**：
  1. 使用 GitHub Actions 讀取 Repo 變數。
  2. 自動構建 Docker 鏡像 (Dockerfile)。
  3. 部署至 Google Cloud Run，獲取正式 HTTPS 網址。

### 性價比方案：Render.com
- **原因**：對開發者最友善，串接 GitHub 後可實現「Push 即部署」。

如需協助建立 GitHub Actions 自動部署流程 (CI/CD)，請隨時告知！
