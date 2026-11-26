# 十二年國教教案生成器 (Lesson Plan Generator)

🌐 **線上使用：[教師數位備課教案小幫手](https://cagoooo.github.io/prepare/)**

> 📌 **目前版本：v1.0.0**（版本管理自 2026-09-06 起，依據 `package.json`）

這是一個專為台灣教師設計的教案生成系統。教師只需輸入基本單元資訊與教學目標，系統即可透過 Google Gemini 自動產出符合十二年國教格式的教案。

## 🚀 核心功能
- **智慧教案生成**：基於 Google Gemini（`gemini-2.5-flash-lite`），生成包含核心素養、學習重點、教學活動等 20 個項目的完整教案。
- **Word 下載功能**：一鍵將生成的教案轉換為標準的 `.docx` 格式。
- **十二年國教適配**：詞彙與邏輯完全符合台灣教育架構。

## 🛠️ 技術架構
- **Frontend**：Vite／HTML／Vanilla CSS／JavaScript，部署在 GitHub Pages（`gh-pages` 分支）
- **Backend**：Firebase Cloud Functions（`functions/`：`generatePlan`、`downloadDocx`）
- **AI Engine**：Google Gemini API
- **Document Rendering**：`html-to-docx`（轉檔前由 `functions/docx-sanitize.js` 移除圖片類標籤，見 [SECURITY.md](SECURITY.md)）

> 早期 Replit 時期的 Python／Flask 版本（`app.py`、`main.py`、`pyproject.toml`、`poetry.lock`、`requirements.txt`）已於 2026-11-26 移除，需要時可從 git 歷史找回。

## 📦 本地開發環境設置

1. **安裝依賴**：
   ```bash
   npm install
   (cd functions && npm install)
   ```

2. **設定環境變數**：複製 `.env.example` 為 `.env` 並填入自己的測試專案設定（勿提交 `.env`）。

3. **啟動前端**：
   ```bash
   npm run dev
   ```

## 📱 網站圖示、分享卡片與版本更新通知

- **圖示與分享圖**：`public/` 內的 favicon、PWA 圖示與 `og-image.png`（1200×630）由 `python scripts/generate_brand_assets.py` 產生（需 Pillow 與微軟正黑體）。改圖後重新執行再 commit 即可，`og:image` 網址會自動帶新的內容雜湊，LINE / Facebook 才會抓新圖。
- **版本號**：GitHub Actions 以 `run number-commit` 注入到 `sw.js` 與 `<meta name="app-version">`，不需手動升版。
- **更新通知**：使用者開著網頁時若有新部署，畫面會跳出「有新版本」通知列，按下即重新整理載入最新版。網址加 `?swdemo=1` 可預覽通知列樣式。
- Facebook 若仍顯示舊預覽圖，到 [分享偵錯工具](https://developers.facebook.com/tools/debug/) 貼上網址並按「重新擷取」。

## 🌐 部署
- **前端**：推送到 `main` 後由 GitHub Actions（`.github/workflows/deploy.yml`）建置並發布到 GitHub Pages。
- **後端**：Firebase 專案與其他工具共用，**只能點名部署**本 repo 的函式：
  ```bash
  firebase deploy --only functions:generatePlan,functions:downloadDocx
  ```
  不要用 `--only functions` 或不加 `--only` 的部署，會影響同專案的其他工具。

---

<!-- BEGIN:PROJECT_GUIDE -->
## 專案導覽

教師數位備課小幫手

- 專案定位：教育科技／教學支援專案
- Repository：`cagoooo/prepare`
- 可見性：公開
- 主要技術：JavaScript、Vite、Firebase
- 線上入口：<https://cagoooo.github.io/prepare/>

### 可以怎麼應用

- 教師備課、課堂示範與學生自主練習
- 依年級、領域或校本課程替換內容，建立可重複使用的教學版本
- 作為教育科技活動、學習成效觀察或 AI 輔助教學的原型

這些是依目前專案定位整理的延伸方向，不代表所有情境都已內建完成；實作前請先確認現有功能與資料格式。

### 技術與專案結構

- `README.md`
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

<!-- akai-edu-tools:backlink -->

---

## 🔗 阿凱老師教育工具集

這個專案是[阿凱老師教育工具集](https://cagoooo.github.io/Akai/)的 **#58 教師數位備課教案小幫手**，由桃園市龍潭區石門國民小學阿凱老師開發。

- 工具介紹頁：[https://cagoooo.github.io/Akai/tool/58/](https://cagoooo.github.io/Akai/tool/58/)
- 線上使用：[https://cagoooo.github.io/prepare/](https://cagoooo.github.io/prepare/)
- 教學情境文章：[https://cagoooo.github.io/Akai/blog/prepare-58-lesson-plan/](https://cagoooo.github.io/Akai/blog/prepare-58-lesson-plan/)
- 全部工具（上百個教育工具與原始碼）：[https://cagoooo.github.io/Akai/](https://cagoooo.github.io/Akai/)

想改造成自己的版本？到上面的教學情境文章，按左下角「複製 AI 開發提示詞」，貼給 ChatGPT、Claude、Gemini 等 AI 助手，就能參考這份原始碼開始規劃。
