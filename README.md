# 十二年國教教案生成器 (Lesson Plan Generator)

這是一個專為台灣教師設計的教案生成系統。透過 OpenAI 的強力支援，教師只需輸入基本單元資訊與教學目標，系統即可自動產出符合十二年國教格式的教案。

## 🚀 核心功能
- **智慧教案生成**：基於 Google Gemini 1.5 Flash，生成包含核心素養、學習重點、教學活動等 20 個項目的完整教案。
- **Word 下載功能**：一鍵將生成的教案轉換為標準的 `.docx` 格式。
- **Email 自動發送**：生成後自動將教案格式化並寄送到指定信箱，方便存檔與分享。
- **十二年國教適配**：詞彙與邏輯完全符合台灣教育架構。

## 🛠️ 技術架構
- **Backend**: Python / Flask
- **AI Engine**: Google Gemini API
- **Document Rendering**: `python-docx`
- **Frontend**: HTML / Vanilla CSS / JavaScript

## 📦 本地開發環境設置

1. **安裝依賴** (建議使用 Poetry):
   ```bash
   poetry install
   ```
   *或使用 pip:*
   ```bash
   pip install flask flask-sqlalchemy google-generativeai python-docx beautifulsoup4 flask-mail python-dotenv gunicorn
   ```

2. **設定環境變數**:
   建立 `.env` 檔案並填入：
   ```env
   GEMINI_API_KEY=你的 Gemini API 金鑰
   MAIL_PASSWORD=信箱應用程式密碼
   ```

3. **啟動程式**:
   ```bash
   python app.py
   ```

## 🌐 部署至 GitHub 的說明
雖然 GitHub Pages 不支援運行具有後端的 Flask 程式，但您可以將代碼託管於 GitHub，並透過以下平台進行部署：
- **Render.com** (推薦，部署設定最簡單)
- **Google Cloud Run**
- **Railway.app**

詳細部署流程請參閱 [部署指南 (manual.md)](manual.md)。

---

<!-- BEGIN:PROJECT_GUIDE -->
## 專案導覽

教師數位備課小幫手

- 專案定位：教育科技／教學支援專案
- Repository：`cagoooo/prepare`
- 可見性：公開
- 主要技術：JavaScript、Vite、Firebase
- 線上入口：未在 GitHub repository metadata 設定

### 可以怎麼應用

- 教師備課、課堂示範與學生自主練習
- 依年級、領域或校本課程替換內容，建立可重複使用的教學版本
- 作為教育科技活動、學習成效觀察或 AI 輔助教學的原型

這些是依目前專案定位整理的延伸方向，不代表所有情境都已內建完成；實作前請先確認現有功能與資料格式。

### 技術與專案結構

- `README.md`
- `app.py`
- `firebase.json`
- `functions`
- `index.html`
- `package.json`
- `vite.config.js`

檔案結構會隨版本演進；若本節與程式碼不一致，以目前預設分支的原始碼為準。

### 本機執行

```bash
npm install
# dev
npm run dev
# build
npm run build
```
請以 `package.json` 的 `scripts` 為準；若專案需要雲端服務，請先建立自己的環境變數與測試專案。

### 給 AI Agent 的接手指南

1. 先閱讀本 README、`AGENTS.md`（若有）、套件腳本與部署設定。
2. 先辨識教材、題庫、提示詞或設定資料的單一來源，避免只改畫面上的副本。
3. 調整內容時維持適齡、可讀性、無障礙與個資保護。
4. 修改後驗證教師操作流程、學生操作流程，以及桌機、平板、手機的可用性。
5. 不要捏造尚未存在的功能；README 與實作有落差時，應同時更新文件。
6. 提交前只納入本次任務檔案，並記錄實際執行過的驗證。

### 安全與資料注意事項

- 不要提交 `.env`、服務帳號、API 金鑰、token、學生個資或正式環境匯出資料。
- 使用 Firebase、Supabase、Google API 或其他雲端服務時，請建立自己的測試專案並套用最小權限。
- 若要公開衍生作品，請先確認程式碼、圖片、音訊、字型與教材內容的授權。

### 貢獻與客製化

歡迎依教學現場、活動或工作流程需求進行 fork／客製化。建議在變更說明中交代使用情境、主要修改、測試方式，以及是否影響資料格式或部署設定。
<!-- END:PROJECT_GUIDE -->
