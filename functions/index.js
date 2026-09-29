const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const line = require("@line/bot-sdk");
const HTMLtoDOCX = require("html-to-docx");
const JSZip = require("jszip");
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
function parseHtmlToFlexBody(htmlContent) {
    const { JSDOM } = require("jsdom");
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

// html-to-docx may emit OOXML elements and attributes in an order Word rejects.
async function repairDocxPackage(docxBuffer) {
    const { JSDOM } = require("jsdom");
    const wordNamespace = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    const zip = await JSZip.loadAsync(docxBuffer);
    const documentXml = zip.file("word/document.xml");
    if (!documentXml) {
        throw new Error("DOCX 缺少主要文件內容，無法產生有效的 Word 檔案。");
    }

    const xml = await documentXml.async("string");
    const dom = new JSDOM(xml, { contentType: "application/xml" });
    const document = dom.window.document;
    const body = document.getElementsByTagNameNS(wordNamespace, "body")[0];
    if (!body) {
        throw new Error("DOCX 缺少文件本文，無法產生有效的 Word 檔案。");
    }

    const sectionProperties = Array.from(body.children).find(node => node.localName === "sectPr");
    if (sectionProperties) body.appendChild(sectionProperties);

    const pageMarginDefaults = { top: 900, right: 900, bottom: 900, left: 900, header: 450, footer: 450, gutter: 0 };
    for (const pageMargins of document.getElementsByTagNameNS(wordNamespace, "pgMar")) {
        for (const [name, fallback] of Object.entries(pageMarginDefaults)) {
            const value = pageMargins.getAttributeNS(wordNamespace, name);
            if (!value || value === "undefined" || !/^\d+$/.test(value)) {
                pageMargins.setAttributeNS(wordNamespace, `w:${name}`, String(fallback));
            }
        }
    }

    const reorderChildren = (parent, names) => {
        const rank = new Map(names.map((name, index) => [name, index]));
        Array.from(parent.children)
            .sort((left, right) => (rank.get(left.localName) ?? Number.MAX_SAFE_INTEGER)
                - (rank.get(right.localName) ?? Number.MAX_SAFE_INTEGER))
            .forEach(node => parent.appendChild(node));
    };
    const tablePropertyOrder = [
        "tblStyle", "tblpPr", "tblOverlap", "bidiVisual", "tblStyleRowBandSize",
        "tblStyleColBandSize", "tblW", "jc", "tblInd", "tblCellSpacing",
        "tblBorders", "shd", "tblLayout", "tblCellMar", "tblLook", "tblCaption",
        "tblDescription",
    ];
    for (const properties of document.getElementsByTagNameNS(wordNamespace, "tblPr")) {
        reorderChildren(properties, tablePropertyOrder);
    }
    const borderOrder = ["top", "left", "bottom", "right", "insideH", "insideV", "tl2br", "tr2bl"];
    for (const elementName of ["tblBorders", "tcBorders"]) {
        for (const borders of document.getElementsByTagNameNS(wordNamespace, elementName)) {
            reorderChildren(borders, borderOrder);
        }
    }
    for (const margins of document.getElementsByTagNameNS(wordNamespace, "tblCellMar")) {
        reorderChildren(margins, ["top", "left", "bottom", "right"]);
    }

    zip.file("word/document.xml", new dom.window.XMLSerializer().serializeToString(document));
    return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
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
                const generatedDocx = await HTMLtoDOCX(styledHtml, null, {
                    table: { row: { cantSplit: true } },
                    margins: { top: 720, bottom: 720, left: 1080, right: 1080, header: 720, footer: 720, gutter: 0 },
                });

                const downloadToken = `token_${Date.now()}`;
                const docxBuffer = await repairDocxPackage(generatedDocx);
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
    try {
        if (req.method !== "POST") {
            return res.status(405).json({ error: "Method Not Allowed" });
        }
        const { html_content } = req.body;
        if (!html_content) {
            return res.status(400).json({ error: "缺少 html_content 欄位" });
        }

        const { JSDOM } = require("jsdom");
        const dom = new JSDOM(html_content);
        const document = dom.window.document;
        const normalizeText = value => String(value || "")
            .replace(/[\t\r\n\f\v]+/g, " ")
            .replace(/[\u00a0\u3000]/g, " ")
            .replace(/ {2,}/g, " ")
            .trim();

        const cells = document.querySelectorAll("td, th");
        cells.forEach(cell => {
            const nestedTables = cell.querySelectorAll("table");
            nestedTables.forEach(nested => {
                const rows = nested.querySelectorAll("tr");
                const div = document.createElement("div");
                rows.forEach(row => {
                    const rowText = normalizeText(Array.from(row.cells).map(c => c.textContent).join(" | "));
                    const p = document.createElement("p");
                    p.textContent = rowText;
                    div.appendChild(p);
                });
                nested.parentNode.replaceChild(div, nested);
            });

            const allElements = [cell, ...cell.querySelectorAll("*")];
            allElements.forEach(el => {
                el.removeAttribute("class");
                el.removeAttribute("style");
                el.removeAttribute("align");
                el.removeAttribute("valign");
            });

            const textWalker = document.createTreeWalker(cell, dom.window.NodeFilter.SHOW_TEXT);
            let textNode;
            while ((textNode = textWalker.nextNode())) {
                const originalText = textNode.nodeValue;
                const normalizedText = originalText
                    .replace(/[\t\r\n\f\v]+/g, " ")
                    .replace(/[\u00a0\u3000]/g, " ")
                    .replace(/ {2,}/g, " ");
                textNode.nodeValue = normalizedText.trim() ? normalizedText : " ";
            }
        });

        const finalHtmlContent = document.body.innerHTML;
        const styledHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { size: A4 portrait; margin: 16mm; }
  body { font-family: 'Microsoft JhengHei', '微軟正黑體', sans-serif; font-size: 11pt; color: #000; text-align: left; }
  table { border-collapse: collapse; width: 100%; border: 1px solid #000; margin-bottom: 8pt; }
  th, td { border: 1px solid #000; padding: 7px; vertical-align: top; text-align: left; text-indent: 0; word-break: normal; }
  th { background-color: #f2f2f2; font-weight: bold; }
  p { margin: 0 0 4pt 0; line-height: 1.35; text-align: left; text-indent: 0; }
  ul, ol { margin: 0 0 4pt 0; padding-left: 18pt; text-align: left; }
  li { margin: 0 0 3pt 0; line-height: 1.35; text-align: left; }
</style>
</head>
<body>${finalHtmlContent}</body>
</html>`;

        const generatedDocx = await HTMLtoDOCX(styledHtml, null, {
            table: { row: { cantSplit: true } },
            pageSize: { width: 11906, height: 16838 },
            margins: { top: 900, bottom: 900, left: 900, right: 900, header: 450, footer: 450, gutter: 0 },
            font: "Microsoft JhengHei",
            fontSize: 22,
            complexScriptFontSize: 22,
            lang: "zh-TW",
        });

        const docxBuffer = await repairDocxPackage(generatedDocx);
            res.setHeader("Content-Disposition", "attachment; filename=lesson_plan.docx");
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        return res.send(Buffer.from(docxBuffer));
    } catch (err) {
        console.error("downloadDocx error:", err);
        return res.status(500).json({ error: err.message });
    }
});
