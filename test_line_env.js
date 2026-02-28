require("dotenv").config({ path: ".secret.local" });
const line = require("@line/bot-sdk");

const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const lineUserId = process.env.LINE_USER_ID;

console.log("Token length:", lineToken ? lineToken.length : 0);

async function testPush() {
    try {
        const client = new line.messagingApi.MessagingApiClient({ channelAccessToken: lineToken });
        await client.pushMessage({
            to: lineUserId,
            messages: [{ type: "text", text: "叮咚！這是來自數位備課小幫手的測試訊息！如果收到這則訊息，代表您新的 LINE API 金鑰設定完全正常！🎉" }]
        });
        console.log("✅ Push message success!");
    } catch (e) {
        console.error("❌ Failed!");
        if (e.originalError && e.originalError.response) {
            console.error(JSON.stringify(e.originalError.response.data, null, 2));
        } else if (e.response && e.response.data) {
            console.error(JSON.stringify(e.response.data, null, 2));
        } else {
            console.error(e.message);
        }
    }
}
testPush();
