const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const line = require("@line/bot-sdk");
const HTMLtoDOCX = require("html-to-docx");
const admin = require("firebase-admin");

// ─── 初始化 Firebase Admin (用於 Storage 操作) ───────────────────────────────
admin.initializeApp();
const bucket = admin.storage().bucket("teacher-c571b-public");

// ─── Firebase Secret Manager ────────────────────────────────────────────────
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const LINE_CHANNEL_ACCESS_TOKEN = defineSecret("LINE_CHANNEL_ACCESS_TOKEN");
const LINE_USER_ID = defineSecret("LINE_USER_ID");

// ─── 建立 LINE Flex Message ─────────────────────────────────────────────────
function createFlexMessage(data, bodyContents, downloadUrl) {
    return {
        type: "bubble",
        size: "mega",
        header: {
            type: "box",
            layout: "vertical",
            backgroundColor: "#0367D3",
            contents: [
                {
                    type: "text",
                    text: `${data.subject || "教案分享"}`,
                    color: "#FFFFFF",
                    weight: "bold",
                    size: "xl"
                }
            ]
        },
        body: {
            type: "box",
            layout: "vertical",
            spacing: "lg",
            paddingAll: "xl",
            contents: bodyContents
        },
        footer: {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            contents: [
                {
                    type: "button",
                    style: "primary",
                    height: "sm",
                    color: "#0367D3",
                    action: {
                        type: "uri",
                        label: "📥 立即下載教案 (Word)",
                        uri: downloadUrl || "https://cagoooo.github.io/prepare/"
                    }
                },
                {
                    type: "button",
                    style: "link",
                    height: "sm",
                    action: {
                        type: "uri",
                        label: "🌍 前往備課網站",
                        uri: "https://cagoooo.github.io/prepare/"
                    }
                }
            ]
        }
    };
}

// ─── 解析 HTML 並轉為 Flex Body ─────────────────────────────────────────────
const { JSDOM } = require("jsdom");
function parseHtmlToFlexBody(htmlContent) {
    const dom = new JSDOM(htmlContent);
    const rows = dom.window.document.querySelectorAll("tr");
    const bodyContents = [];

    const emojiMap = {
        "學習領域": "📚",
        "科目": "📚",
        "實施年級": "🎓",
        "單元名稱": "🏷️",
        "教學時間": "⏳",
        "學習目標": "🎯",
        "先備知識": "🧠",
        "教材教具": "🛠️",
        "教學方法": "🏫",
        "教學活動內容": "📋",
        "實施方式": "📋",
        "評量方式": "📝",
        "差異化教學": "♿",
        "跨領域": "🔗",
        "議題連結": "🔗"
    };

    rows.forEach((row) => {
        const cells = row.querySelectorAll("th, td");
        if (cells.length >= 2) {
            const rawKey = cells[0].textContent.trim().replace("（僅供參考）", "");
            let emoji = "🔹";
            for (const key in emojiMap) {
                if (rawKey.includes(key)) {
                    emoji = emojiMap[key];
                    break;
                }
            }

            let value = cells[1].innerHTML
                .replace(/<br\s*\/?>/gi, "\n")
                .replace(/<p>/gi, "")
                .replace(/<\/p>/gi, "\n")
                .replace(/<li>/gi, "• ")
                .replace(/<\/li>/gi, "\n");
            const valueDom = new JSDOM(value);
            value = valueDom.window.document.body.textContent.trim();
            if (!value) return;

            if (value.length > 150) {
                value = value.slice(0, 150) + "\n...\n(內容較長，請點擊下方按鈕至網頁查看完整內容)";
            }

            bodyContents.push({
                type: "box",
                layout: "vertical",
                margin: "lg",
                spacing: "sm",
                contents: [
                    {
                        type: "text",
                        text: `${emoji} ${rawKey}`,
                        weight: "bold",
                        color: "#0367D3",
                        size: "md",
                        wrap: true
                    },
                    {
                        type: "text",
                        text: value,
                        wrap: true,
                        size: "sm",
                        color: "#333333",
                        margin: "sm"
                    },
                    {
                        type: "separator",
                        margin: "lg",
                        color: "#EEEEEE"
                    }
                ]
            });
        }
    });

    return bodyContents;
}

// ─── generatePlan Cloud Function ────────────────────────────────────────────
exports.generatePlan = onRequest(
    { secrets: [GEMINI_API_KEY, LINE_CHANNEL_ACCESS_TOKEN, LINE_USER_ID], region: "asia-east1", cors: "https://cagoooo.github.io" },
    async (req, res) => {
        // 註：onRequest 已設定 cors: true，Firebase 會自動處理 CORS 預檢與標頭。
        if (req.method !== "POST") {
            return res.status(405).json({ error: "Method Not Allowed" });
        }

        const { subject, grade, unit, duration, objectives, materials, methods, details } = req.body;
        if (!subject || !grade || !unit) {
            return res.status(400).json({ error: "缺少必填欄位：subject, grade, unit" });
        }

        // ── Prompt ──
        const prompt = `你是一位台灣的資深教師，請依照十二年國教課程綱要，為以下課程單元設計一份詳細的教學活動設計表（教案）。
請完整填寫所有欄位，並以 HTML 表格格式輸出，表格包含以下欄位：
1. 學習領域 / 科目
2. 實施年級
3. 單元名稱
4. 教學時間（分鐘）
5. 學習目標（條列式）
6. 先備知識
7. 教材教具
8. 教學方法
9. 教學活動內容及實施方式（分引起動機、發展活動、綜合活動三個階段，每個階段的時間分配要合理）
10. 評量方式
11. 差異化教學策略
12. 跨領域/議題連結
提供的基本資訊如下：
- 學習領域/科目：${subject}
- 實施年級：${grade}
- 單元名稱：${unit}
- 教學時間：${duration || "40分鐘"}
- 學習目標：${objectives || "請自行依據十二年國教核心素養擬定"}
- 教材教具：${materials || "請自行建議適合的教材教具"}
- 教學方法：${methods || "請自行建議適合的教學方法"}
- 提供的額外細節：${details || "無"}
- 備注：教案內容中的「教學活動內容及實施方式」欄位，請標示清楚每個活動階段的時間分配（如「引起動機：5分鐘」）。
請以完整的 HTML 表格格式（使用 <table>, <tr>, <th>, <td> 標籤）輸出，不要包含任何 Markdown 語法。
每個欄位的說明都要詳細完整，並根據台灣教育環境設計符合實際教學的內容。`;

        try {
            const genAI = new GoogleGenerativeAI(GEMINI_API_KEY.value());
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

            let response;
            let retryCount = 0;
            const maxRetries = 2;

            while (retryCount <= maxRetries) {
                try {
                    const result = await model.generateContent(prompt);
                    response = result.response;
                    break; // 成功則跳出循環
                } catch (aiErr) {
                    if (aiErr.message.includes("503") || aiErr.status === 503) {
                        retryCount++;
                        if (retryCount <= maxRetries) {
                            console.warn(`Gemini API 繁忙 (503)，等待 2 秒後進行第 ${retryCount} 次重試...`);
                            await new Promise(resolve => setTimeout(resolve, 2000));
                            continue;
                        }
                    }
                    throw aiErr; // 其他錯誤或重試耗盡則拋出
                }
            }

            let content = response.text().replace(/```html/g, "").replace(/```/g, "").trim();
            if (content.includes("</table>")) {
                content = content.split("</table>")[0] + "</table>";
            }

            // ── 同步產出 DOCX 並上傳至 Storage ──
            let downloadUrl = null;
            try {
                const styledHtml = `<!DOCTYPE html><html><head><style>body { font-family: 'Microsoft JhengHei', sans-serif; font-size: 11pt; } table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #000; padding: 8px; vertical-align: top; } th { background-color: #D9EAD3; font-weight: bold; }</style></head><body>${content}</body></html>`;
                const docxBuffer = await HTMLtoDOCX(styledHtml, null, {
                    table: { row: { cantSplit: true } },
                    margin: { top: 720, bottom: 720, left: 1080, right: 1080 },
                });

                const downloadToken = `token_${Date.now()}`;
                const fileName = `lesson_plans/${Date.now()}_${unit.replace(/\s+/g, "_")}.docx`;
                const file = bucket.file(fileName);
                await file.save(Buffer.from(docxBuffer), {
                    metadata: {
                        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        // Removed firebaseStorageDownloadTokens as per instruction to use public URL
                    }
                });

                // 手動建構具備 Token 的下載連結 (無須 IAM 簽署權限，更穩定)
                // 使用穩定的公開 GCS 下載連結
                downloadUrl = `https://storage.googleapis.com/teacher-c571b-public/${encodeURIComponent(fileName)}`;
                console.log("Generated Public Download URL:", downloadUrl);
            } catch (docxErr) {
                console.error("DOCX skip/fail:", docxErr.message);
                console.error("Stack:", docxErr.stack);
            }

            // ── LINE Flex 通知 ──
            try {
                const lineToken = LINE_CHANNEL_ACCESS_TOKEN.value();
                const lineUserId = LINE_USER_ID.value();
                if (lineToken && lineUserId) {
                    const client = new line.messagingApi.MessagingApiClient({ channelAccessToken: lineToken });
                    const flexBody = parseHtmlToFlexBody(content);
                    const flexMsg = createFlexMessage({ subject, grade, unit }, flexBody, downloadUrl);

                    await client.pushMessage({
                        to: lineUserId,
                        messages: [{ type: "flex", altText: "教案生成成功", contents: flexMsg }],
                    });
                    console.log("LINE Flex notification sent.");
                }
            } catch (lineErr) {
                console.error("LINE notification failed!");
                if (lineErr.response && lineErr.response.headers) {
                    // 檢查 x-line-request-id 方便查案
                    console.error("Request ID:", lineErr.response.headers["x-line-request-id"]);
                }
                if (lineErr.body && lineErr.body.details) {
                    console.error("Error details (v9):", JSON.stringify(lineErr.body.details, null, 2));
                } else if (lineErr.response && lineErr.response.data) {
                    console.error("Error data:", JSON.stringify(lineErr.response.data, null, 2));
                } else {
                    console.error("Error message:", lineErr.message);
                    console.error("Full error:", lineErr);
                }
            }

            return res.json({ success: true, plan: content, html_content: content });
        } catch (err) {
            console.error("generatePlan error:", err);
            return res.status(500).json({ success: false, error: err.message, stack: err.stack });
        }
    }
);

// ─── downloadDocx Cloud Function ────────────────────────────────────────────
exports.downloadDocx = onRequest({ region: "asia-east1", cors: "https://cagoooo.github.io" }, async (req, res) => {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }
    const { html_content } = req.body;
    if (!html_content) {
        return res.status(400).json({ error: "缺少 html_content 欄位" });
    }
    try {
        const dom = new JSDOM(html_content);
        const document = dom.window.document;

        // 激底扁平化：將表格內的複雜結構全部轉為段落
        const cells = document.querySelectorAll("td, th");
        cells.forEach(cell => {
            // 先處理清單，將 li 轉為帶點的文字
            const lists = cell.querySelectorAll("ul, ol");
            lists.forEach(list => {
                const items = list.querySelectorAll("li");
                items.forEach(li => {
                    const p = document.createElement("p");
                    p.textContent = "• " + li.textContent;
                    li.parentNode.replaceChild(p, li);
                });
                // 移除 ul/ol 標籤，保留內容
                while (list.firstChild) {
                    list.parentNode.insertBefore(list.firstChild, list);
                }
                list.parentNode.removeChild(list);
            });

            // 再處理子表格，將其內容全部拉出來並轉成文字
            const nestedTables = cell.querySelectorAll("table");
            nestedTables.forEach(nested => {
                const rows = nested.querySelectorAll("tr");
                const div = document.createElement("div");
                rows.forEach(row => {
                    const rowText = Array.from(row.cells).map(c => c.textContent.trim()).join(" | ");
                    const p = document.createElement("p");
                    p.textContent = rowText;
                    div.appendChild(p);
                });
                nested.parentNode.replaceChild(div, nested);
            });

            // 移除所有 class 與 style，防止干擾渲染
            const allElements = cell.querySelectorAll("*");
            allElements.forEach(el => {
                el.removeAttribute("class");
                el.removeAttribute("style");
            });
        });

        const finalHtmlContent = document.body.innerHTML;

        const styledHtml = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { margin: 2cm; }
  body { font-family: 'Microsoft JhengHei', '微軟正黑體', sans-serif; font-size: 11pt; color: #000; }
  table { border-collapse: collapse; width: 100%; border: 1px solid #000; margin-bottom: 10pt; }
  th, td { border: 1px solid #000; padding: 10px; vertical-align: top; word-break: break-all; }
  th { background-color: #f2f2f2; font-weight: bold; }
  p { margin: 0 0 5pt 0; line-height: 1.5; }
</style>
</head>
<body>${finalHtmlContent}</body>
</html>`;
        const docxBuffer = await HTMLtoDOCX(styledHtml, null, {
            table: { row: { cantSplit: true } },
            margin: { top: 720, bottom: 720, left: 1080, right: 1080 },
        });
        res.setHeader("Content-Disposition", "attachment; filename=lesson_plan.docx");
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        return res.send(Buffer.from(docxBuffer));
    } catch (err) {
        console.error("downloadDocx error:", err);
        return res.status(500).json({ error: err.message });
    }
});
