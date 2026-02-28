const { JSDOM } = require("jsdom");
const html = `<table><tr><th>測試</th><td><p>第一段</p><ul><li>項目A</li><li>項目B</li></ul></td></tr></table>`;
const dom = new JSDOM(html);
const rows = dom.window.document.querySelectorAll("tr");
rows.forEach((row) => {
    let value = row.querySelectorAll("th, td")[1].innerHTML
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<p>/gi, "")
        .replace(/<\/p>/gi, "\n")
        .replace(/<li>/gi, "• ")
        .replace(/<\/li>/gi, "\n");
    const vDom = new JSDOM(value);
    console.log("Val:\n" + vDom.window.document.body.textContent.trim());
});
