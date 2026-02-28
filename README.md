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
