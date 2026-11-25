# 安全性說明

## Dependabot 警告評估紀錄

### 2026-11-25：image-size（`functions/package-lock.json`）

| 警告 | 套件與位置 | 判斷 |
|---|---|---|
| #5 GHSA-w3rx-r6r6-pgpr（ICNS 解析無限迴圈） | `image-size`，由 `html-to-docx` 帶入 | 已評估（tolerable_risk） |
| #6 GHSA-5p2g-fcmc-qvqq（JXL／HEIF 解析無限迴圈） | 同上 | 已評估（tolerable_risk） |

**為什麼不升級**
- `html-to-docx` 1.8.0 已是最新版，要求 `image-size ^1`；修補版只有 2.x（跨大版號）。
- 更重要的是 `html-to-docx` 把 image-size **打包在自己的程式裡**，執行時不讀 `node_modules/image-size`，用 `overrides` 只會讓警告消失、風險還在。

**實際的防護（commit `6685082`）**
- `html-to-docx` 只有在處理 `<img>` 時才會由伺服器下載圖片網址，再交給 image-size 解析。
- `functions/docx-sanitize.js` 在轉 Word 前移除 `img`、`svg`、`picture`、`iframe`、`object`、`embed`、`script` 等標籤與註解：
  - `downloadDocx`：使用者送來的 HTML
  - `generatePlan`：AI 產出的內容
- 教案只有文字與表格，不需要圖片。
- 本機以假圖片伺服器實測：清理前會被叫去下載 1 次，清理後 0 次；Word 文字完整。

**什麼情況要重開這兩則**
- 教案需要支援圖片，或拿掉 `docx-sanitize.js` 的呼叫。
- `html-to-docx` 改版改用外部 image-size（可直接升級時）。
- 新增其他會呼叫 `HTMLtoDOCX` 的地方，卻沒有先經過 `sanitizeHtmlForDocx` / `removeEmbeddedMedia`。

### 尚未處理：`poetry.lock`、`pyproject.toml`（Python）

來自 Replit 時期的舊 Flask 版本（`app.py`、`main.py`）。現行正式版為 GitHub Pages＋Cloud Functions，不使用這些 Python 套件。待決定移除舊檔或標為已評估。
