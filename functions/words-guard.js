/**
 * 漢語新解（generateExplanation）的三道防線
 *
 *   ① 必須用 Google 帳號登入（後端 verifyIdToken，匿名一律不算）→ 401
 *   ② Cloudflare Turnstile 人機驗證（siteverify，token 一次性）    → 403
 *   ③ 每位登入使用者每天最多 5 次（台北時間午夜重置，Firestore transaction）→ 429
 *
 * 順序：登入 → 人機驗證 → 每日次數（通過人機驗證才扣次數；AI 失敗會退回次數）
 *
 * ⚠️ 本檔在 cagoooo/words 與 cagoooo/prepare 的 functions/ 各有一份，內容必須一致。
 *    改其中一份時，另一份也要同步，避免日後部署互蓋。
 *
 * - Turnstile secret 放 Secret Manager：WORDS_TURNSTILE_SECRET（函式 secrets 要加上它）
 * - 使用 firebase-admin 預設 app（呼叫端要先 initializeApp）
 */

const { getAuth } = require('firebase-admin/auth')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')

const DAILY_LIMIT = 5
const QUOTA_COLLECTION = 'wordsDailyUsage'
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const TURNSTILE_EXPECTED_HOSTNAME = 'cagoooo.github.io'
const TURNSTILE_EXPECTED_ACTION = 'words_explain'

class GuardError extends Error {
    /**
     * @param {number} status HTTP 狀態碼
     * @param {string} message 給使用者看的中文訊息
     * @param {object} [extra] 額外回傳欄位
     */
    constructor(status, message, extra = {}) {
        super(message)
        this.status = status
        this.extra = extra
    }
}

/** ① 驗證 Google 登入（拒絕沒帶、無效、匿名） */
async function requireGoogleUser(req) {
    const match = String(req.get('Authorization') || '').match(/^Bearer (.+)$/)
    if (!match) throw new GuardError(401, '請先用 Google 帳號登入才能使用（每人每天 5 次）', { code: 'auth_required' })
    let decoded
    try {
        decoded = await getAuth().verifyIdToken(match[1])
    } catch (_) {
        throw new GuardError(401, '登入已過期，請重新登入後再試', { code: 'auth_invalid' })
    }
    const provider = decoded.firebase && decoded.firebase.sign_in_provider
    if (provider !== 'google.com') {
        throw new GuardError(401, '請先用 Google 帳號登入才能使用（每人每天 5 次）', { code: 'auth_required' })
    }
    return decoded
}

/** ② 驗證 Turnstile token（fail-closed：Cloudflare 連不上也拒絕） */
async function verifyTurnstile(token, secret, remoteIp) {
    if (!secret) throw new GuardError(503, '人機驗證尚未完成設定，請稍後再試', { code: 'turnstile_unconfigured' })
    if (typeof token !== 'string' || token.length < 1 || token.length > 2048) {
        throw new GuardError(403, '請先完成頁面上的人機驗證，再按一次', { code: 'turnstile_missing' })
    }
    let result
    try {
        const params = new URLSearchParams({ secret, response: token })
        if (remoteIp && remoteIp !== 'unknown') params.append('remoteip', remoteIp)
        const response = await fetch(TURNSTILE_VERIFY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params,
            signal: AbortSignal.timeout(5000)
        })
        if (!response.ok) throw new Error(`Siteverify HTTP ${response.status}`)
        result = await response.json()
    } catch (err) {
        console.error('Turnstile siteverify unavailable:', err && err.message)
        throw new GuardError(503, '人機驗證服務暫時無法連線，請稍後再試', { code: 'turnstile_unavailable' })
    }
    if (!result.success) {
        console.warn('Turnstile rejected:', result['error-codes'] || [])
        throw new GuardError(403, '人機驗證未通過或已過期，請重新驗證後再試', { code: 'turnstile_failed' })
    }
    if (result.hostname !== TURNSTILE_EXPECTED_HOSTNAME || result.action !== TURNSTILE_EXPECTED_ACTION) {
        console.warn('Turnstile hostname/action mismatch:', result.hostname, result.action)
        throw new GuardError(403, '人機驗證資訊不符，請重新整理頁面後再試', { code: 'turnstile_mismatch' })
    }
}

/** 台北時間的日期字串 YYYY-MM-DD */
function taipeiDate() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date())
}

function quotaRef(uid, date) {
    return getFirestore().collection(QUOTA_COLLECTION).doc(`${uid}_${date}`)
}

/** ③ 扣一次今日次數；超過上限丟 429。回傳 { date, used, remaining } */
async function consumeDailyQuota(user) {
    const date = taipeiDate()
    const ref = quotaRef(user.uid, date)
    const used = await getFirestore().runTransaction(async (tx) => {
        const snap = await tx.get(ref)
        const count = snap.exists ? Number(snap.get('count') || 0) : 0
        if (count >= DAILY_LIMIT) {
            throw new GuardError(429, `今天 ${DAILY_LIMIT} 次已用完，明天再來（台北時間午夜重置）`, {
                code: 'daily_limit',
                remaining: 0,
                limit: DAILY_LIMIT
            })
        }
        tx.set(ref, {
            uid: user.uid,
            email: user.email || '',
            date,
            count: count + 1,
            updatedAt: FieldValue.serverTimestamp()
        }, { merge: true })
        return count + 1
    })
    return { date, used, remaining: Math.max(0, DAILY_LIMIT - used) }
}

/** AI 失敗時把剛扣的那一次退回（盡力而為） */
async function refundDailyQuota(user, date) {
    try {
        const ref = quotaRef(user.uid, date)
        await getFirestore().runTransaction(async (tx) => {
            const snap = await tx.get(ref)
            const count = snap.exists ? Number(snap.get('count') || 0) : 0
            if (count > 0) tx.update(ref, { count: count - 1, updatedAt: FieldValue.serverTimestamp() })
        })
    } catch (err) {
        console.warn('refundDailyQuota failed:', err && err.message)
    }
}

/** 通知卡用的使用者顯示文字：名稱（Email） */
function describeUser(user) {
    if (!user) return ''
    const name = user.name || '（未提供名稱）'
    return user.email ? `${name}（${user.email}）` : name
}

module.exports = {
    DAILY_LIMIT,
    GuardError,
    requireGoogleUser,
    verifyTurnstile,
    consumeDailyQuota,
    refundDailyQuota,
    describeUser
}
