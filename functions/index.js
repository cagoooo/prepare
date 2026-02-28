const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const cors = require("cors")({ origin: true });
const { GoogleGenAI } = require("@google/genai");
const line = require("@line/bot-sdk");
const HTMLtoDOCX = require("html-to-docx");

// ─── Firebase Secret Manager (已升級 Blaze 方案，金鑰安全云端加密儲存) ───────
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const LINE_CHANNEL_ACCESS_TOKEN = defineSecret("LINE_CHANNEL_ACCESS_TOKEN");
const LINE_USER_ID = defineSecret("LINE_USER_ID");

// ─── 建立 LINE Flex Message ─────────────────────────────────────────────────
function createFlexMessage(data, bodyContents) {
    return {
        type: "bubble",
        size: "giga",
        header: {
            type: "box",
            layout: "vertical",
            backgroundColor: "#2C3E50",
            paddingAll: "20px",
            contents: [
                {
                    type: "text",
                    text: "🎓 教師數位備課小幫手",
                    color: "#FFFFFF",
                    weight: "bold",
                    size: "sm",
                },
                {
                    type: "text",
                    text: `${data.subject} - ${data.unit}`,
                    color: "#F39C12",
                    weight: "bold",
                    size: "xl",
                    margin: "md",
                    wrap: true,
                },
                {
                    type: "text",
                    text: `適用年級：${data.grade}`,
                    color: "#BDC3C7",
                    size: "xs",
                    margin: "sm",
                },
            ],
        },
        body: {
            type: "box",
            layout: "vertical",
            backgroundColor: "#F8F9F9",
            paddingAll: "20px",
            contents: bodyContents,
        },
    };
}

// ─── 解析 HTML 並轉為 Flex Body ─────────────────────────────────────────────
const { JSDOM } = require("jsdom");
function parseHtmlToFlexBody(htmlContent) {
    const dom = new JSDOM(htmlContent);
    const rows = dom.window.document.querySelectorAll("tr");
    const bodyContents = [];

    rows.forEach((row) => {
        const cells = row.querySelectorAll("th, td");
        if (cells.length >= 2) {
            const key = cells[0].textContent.trim().replace("（僅供參考）", "");
            let value = cells[1].innerHTML.replace(/<br\s*\/?>/gi, "\n");
            const valueDom = new JSDOM(value);
            value = valueDom.window.document.body.textContent.trim();
            if (!value) return;
            if (value.length > 1900) {
                value = value.slice(0, 1900) + "...\n(內容過長，請至網頁或 Word 檔查看完整內容)";
            }
            bodyContents.push({
                type: "box",
                layout: "vertical",
                margin: "lg",
                spacing: "sm",
                contents: [
                    { type: "text", text: `📌 ${key}`, weight: "bold", color: "#1DB446", size: "sm", wrap: true },
                    { type: "text", text: value, wrap: true, size: "sm", color: "#333333" },
                ],
            });
            bodyContents.push({ type: "separator", margin: "lg" });
        }
    });

    // 移除最後多餘的分隔線
    if (bodyContents.length && bodyContents[bodyContents.length - 1].type === "separator") {
        bodyContents.pop();
    }
    return bodyContents;
}

// ─── generatePlan Cloud Function ────────────────────────────────────────────
exports.generatePlan = onRequest(
    { secrets: [GEMINI_API_KEY, LINE_CHANNEL_ACCESS_TOKEN, LINE_USER_ID], region: "asia-east1" },
    async (req, res) => {
        cors(req, res, async () => {
            if (req.method !== "POST") {
                return res.status(405).json({ error: "Method Not Allowed" });
            }
            const { subject, grade, unit, duration, objectives, materials, methods } = req.body;
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
- 備注：教案內容中的「教學活動內容及實施方式」欄位，請標示清楚每個活動階段的時間分配（如「引起動機：5分鐘」）。
請以完整的 HTML 表格格式（使用 <table>, <tr>, <th>, <td> 標籤）輸出，不要包含任何 Markdown 語法。
每個欄位的說明都要詳細完整，並根據台灣教育環境設計符合實際教學的內容。`;

            try {
                const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY.value() });
                const response = await ai.models.generateContent({
                    model: "gemini-2.5-flash-lite",
                    contents: prompt,
                });
                let content = response.text.replace(/```html/g, "").replace(/```/g, "").trim();
                if (content.includes("</table>")) {
                    content = content.split("</table>")[0] + "</table>";
                }

                // ── LINE Flex 通知 ──
                try {
                    const lineToken = LINE_CHANNEL_ACCESS_TOKEN.value();
                    const lineUserId = LINE_USER_ID.value();
                    if (lineToken && lineUserId) {
                        const client = new line.messagingApi.MessagingApiClient({ channelAccessToken: lineToken });
                        const flexBody = parseHtmlToFlexBody(content);
                        const flexMsg = createFlexMessage({ subject, grade, unit }, flexBody);
                        await client.pushMessage({
                            to: lineUserId,
                            messages: [{ type: "flex", altText: `✨ 教案生成成功！(${subject} - ${unit})`, contents: flexMsg }],
                        });
                        console.log("LINE Flex notification sent.");
                    }
                } catch (lineErr) {
                    console.error("LINE notification failed:", lineErr.message);
                }

                return res.json({ success: true, plan: content, html_content: content });
            } catch (err) {
                console.error("generatePlan error:", err);
                return res.status(500).json({ success: false, error: err.message });
            }
        });
    }
);

// ─── downloadDocx Cloud Function ────────────────────────────────────────────
exports.downloadDocx = onRequest({ region: "asia-east1" }, async (req, res) => {
    cors(req, res, async () => {
        if (req.method !== "POST") {
            return res.status(405).json({ error: "Method Not Allowed" });
        }
        const { html_content } = req.body;
        if (!html_content) {
            return res.status(400).json({ error: "缺少 html_content 欄位" });
        }
        try {
            const styledHtml = `
<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: 'Microsoft JhengHei', sans-serif; font-size: 11pt; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #000; padding: 8px; vertical-align: top; }
  th { background-color: #D9EAD3; font-weight: bold; }
</style>
</head>
<body>${html_content}</body>
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
});
