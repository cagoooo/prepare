/**
 * Google Chat 即時通知（每次有人使用 AI 功能都通知網站主人）
 *
 * - Webhook 網址放在 Secret Manager：GOOGLE_CHAT_WEBHOOK_URL（函式 secrets 要加上它）
 * - 盡力而為：送不出去只會 console.warn，絕不影響主功能
 * - 最多等 2.5 秒；網址空白或不是 https://chat.googleapis.com/ 開頭就略過
 * - 被擋下的呼叫（401/403/429）同一 IP 每 5 分鐘最多通知 1 次，避免被狂打時洗版
 */

const WEBHOOK_PREFIX = 'https://chat.googleapis.com/'
const SEND_TIMEOUT_MS = 2500
const BLOCKED_WINDOW_MS = 5 * 60 * 1000
const lastBlockedByIp = new Map()

const STATUS_META = {
    success: { emoji: '✅', label: '成功', color: '#16A34A' },
    failed: { emoji: '❌', label: '失敗', color: '#DC2626' },
    blocked: { emoji: '⚠️', label: '被擋下', color: '#D97706' }
}

function taipeiTime() {
    return new Intl.DateTimeFormat('zh-TW', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).format(new Date())
}

function escapeCardText(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
}

/** 取得來源 IP（Cloud Functions 前面有 Google 前端，取 x-forwarded-for 第一段） */
function getClientIp(req) {
    const forwarded = String((req.headers && req.headers['x-forwarded-for']) || '')
        .split(',')[0]
        .trim()
    return forwarded || req.ip || 'unknown'
}

/** 遮蔽 IP 末段：IPv4 → 1.2.3.x；IPv6 → 前 3 段:x */
function maskIp(ip) {
    const value = String(ip || '').trim().replace(/^::ffff:/, '')
    if (!value || value === 'unknown') return '未知'
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) {
        return value.split('.').slice(0, 3).join('.') + '.x'
    }
    if (value.includes(':')) {
        return value.split(':').filter(Boolean).slice(0, 3).join(':') + ':x'
    }
    return '已遮蔽'
}

function truncate(value, max) {
    const chars = Array.from(String(value == null ? '' : value).replace(/\s+/g, ' ').trim())
    return chars.length > max ? chars.slice(0, max).join('') + '…' : chars.join('')
}

function shouldNotifyBlocked(ip) {
    const key = String(ip || 'unknown')
    const now = Date.now()
    const last = lastBlockedByIp.get(key)
    if (last && now - last < BLOCKED_WINDOW_MS) return false
    lastBlockedByIp.set(key, now)
    if (lastBlockedByIp.size > 500) {
        for (const [k, t] of lastBlockedByIp.entries()) {
            if (now - t >= BLOCKED_WINDOW_MS) lastBlockedByIp.delete(k)
        }
    }
    return true
}

function buildTitle(status, siteName) {
    if (status === 'success') return `✅ 有人使用了 ${siteName}`
    if (status === 'failed') return `❌ ${siteName} 失敗`
    return '⚠️ 被擋下的呼叫'
}

/**
 * 發送通知。
 * @param {object} info
 * @param {'success'|'failed'|'blocked'} info.status
 * @param {string} info.siteName 網站中文名
 * @param {string} info.feature 功能名稱
 * @param {string} [info.user] 使用者（有登入才有）
 * @param {number} [info.durationMs] 耗時（毫秒）
 * @param {string} [info.ip] 原始 IP（只用於節流；顯示請放在 fields 並先 maskIp）
 * @param {string} [info.error] 錯誤摘要（自動截前 120 字）
 * @param {{label: string, value: string}[]} [info.fields] 其他欄位
 */
async function notifyGoogleChat(info) {
    try {
        const webhookUrl = String(process.env.GOOGLE_CHAT_WEBHOOK_URL || '').trim()
        if (!webhookUrl || !webhookUrl.startsWith(WEBHOOK_PREFIX)) return

        const status = STATUS_META[info.status] ? info.status : 'failed'
        if (status === 'blocked' && !shouldNotifyBlocked(info.ip)) return

        const meta = STATUS_META[status]
        const title = buildTitle(status, info.siteName)
        const fields = [
            { label: '網站', value: info.siteName },
            { label: '功能', value: info.feature },
            { label: '狀態', value: meta.label }
        ]
        if (info.user) fields.push({ label: '使用者', value: info.user })
        fields.push({ label: '台北時間', value: taipeiTime() })
        if (typeof info.durationMs === 'number') {
            fields.push({ label: '耗時', value: `${(info.durationMs / 1000).toFixed(1)} 秒` })
        }
        for (const field of info.fields || []) {
            if (field && field.label) fields.push({ label: field.label, value: field.value })
        }
        if (info.error) fields.push({ label: '錯誤摘要', value: truncate(info.error, 120) })

        const text = [title, ...fields.map((f) => `${f.label}：${f.value || '—'}`)]
            .join('\n')
            .slice(0, 4000)

        const widgets = fields.map((f) => ({
            decoratedText: {
                topLabel: escapeCardText(f.label),
                text: f.label === '狀態'
                    ? `<font color="${meta.color}"><b>${meta.label}</b></font>`
                    : escapeCardText(f.value || '—'),
                wrapText: true
            }
        }))

        const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify({
                text,
                cardsV2: [{
                    cardId: `ai-usage-${status}`,
                    card: {
                        header: { title, subtitle: `${info.siteName} 即時通知` },
                        sections: [{ widgets }]
                    }
                }]
            }),
            signal: AbortSignal.timeout(SEND_TIMEOUT_MS)
        })
        if (!res.ok) {
            console.warn('[notify-google-chat] webhook 回應錯誤', res.status, (await res.text()).slice(0, 200))
        }
    } catch (err) {
        console.warn('[notify-google-chat] 通知送出失敗', err && err.message)
    }
}

module.exports = { notifyGoogleChat, getClientIp, maskIp, truncate }
