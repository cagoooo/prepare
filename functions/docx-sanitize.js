// 轉 Word 前先清掉所有「圖片／嵌入媒體」標籤。
//
// 為什麼：html-to-docx 遇到 <img src="http..."> 會由伺服器主動去下載那張圖，
// 下載後再交給它內建（打包在套件裡、無法用 overrides 升級）的 image-size 解析。
// 等於讓任何人能指揮我們的 Cloud Function 去連任意網址，並把任意檔案丟給有漏洞的解析器。
// 教案內容只有文字與表格，用不到圖片，所以一律移除。
const { JSDOM } = require("jsdom");

// html-to-docx 只會處理 img，其餘一併移除做為預防（避免日後套件改版開始處理它們）。
const EMBEDDED_MEDIA_SELECTOR = [
    "img", "picture", "source", "svg", "image", "video", "audio", "track",
    "object", "embed", "iframe", "frame", "frameset", "canvas", "map", "area",
    "script", "style", "link", "meta", "base", "template", "noscript",
].join(",");

/**
 * 直接修改傳入的 DOM document，移除圖片類元素與註解。
 * @returns {number} 移除的元素數量（不含註解）
 */
function removeEmbeddedMedia(document) {
    const root = document.body || document.documentElement;
    if (!root) return 0;
    const nodes = Array.from(root.querySelectorAll(EMBEDDED_MEDIA_SELECTOR));
    nodes.forEach(node => node.remove());

    // 註解裡的標籤不會被轉換，但一併清掉，避免解析器之間的差異
    const walker = document.createTreeWalker(root, 128 /* NodeFilter.SHOW_COMMENT */);
    const comments = [];
    let comment;
    while ((comment = walker.nextNode())) comments.push(comment);
    comments.forEach(c => c.remove());

    return nodes.length;
}

/**
 * 字串版：回傳清理後的 body innerHTML。
 */
function sanitizeHtmlForDocx(html) {
    const dom = new JSDOM(String(html || ""));
    removeEmbeddedMedia(dom.window.document);
    return dom.window.document.body.innerHTML;
}

module.exports = { removeEmbeddedMedia, sanitizeHtmlForDocx, EMBEDDED_MEDIA_SELECTOR };
