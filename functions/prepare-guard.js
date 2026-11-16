/**
 * 備課小幫手（generatePlan）的每日次數控管
 *
 *   ① 必須用 Google 帳號登入（沿用 words-guard.js 的 requireGoogleUser，匿名一律不算）→ 401
 *   ② Cloudflare Turnstile 人機驗證（index.js 的 verifyTurnstileToken，action generate_plan）→ 403
 *   ③ 每位登入使用者每天最多 5 次（台北時間午夜重置，Firestore transaction）→ 429
 *
 * 順序：登入 → 人機驗證 → 每日次數（通過人機驗證才扣；Gemini 失敗會退回次數）
 *
 * - 次數存在 prepare 專用的 Firestore 資料庫 prepare-rate-limits，集合 prepareDailyUsage，
 *   不與漢語新解（words）的 wordsDailyUsage 共用，兩個網站各自每天 5 次。
 */

const { FieldValue, Timestamp } = require('firebase-admin/firestore')
const { GuardError } = require('./words-guard')

const PLAN_DAILY_LIMIT = 5
const PLAN_QUOTA_COLLECTION = 'prepareDailyUsage'

/** 台北時間的日期字串 YYYY-MM-DD */
function taipeiDate() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date())
}

function quotaRef(db, uid, date) {
    return db.collection(PLAN_QUOTA_COLLECTION).doc(`user_${uid}_${date}`)
}

/** 扣一次今日次數；超過上限丟 429。回傳 { date, used, remaining } */
async function consumePlanQuota(db, user) {
    const date = taipeiDate()
    const ref = quotaRef(db, user.uid, date)
    const used = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref)
        const count = snap.exists ? Number(snap.get('count') || 0) : 0
        if (count >= PLAN_DAILY_LIMIT) {
            throw new GuardError(429, `今天的 ${PLAN_DAILY_LIMIT} 次已用完，明天（台北時間午夜後）再來`, {
                code: 'daily_limit',
                remaining: 0,
                limit: PLAN_DAILY_LIMIT
            })
        }
        tx.set(ref, {
            uid: user.uid,
            date,
            count: count + 1,
            updatedAt: FieldValue.serverTimestamp(),
            // 兩天後可由 TTL 清掉
            expireAt: Timestamp.fromMillis(Date.now() + 2 * 24 * 60 * 60 * 1000)
        }, { merge: true })
        return count + 1
    })
    return { date, used, remaining: Math.max(0, PLAN_DAILY_LIMIT - used) }
}

/** Gemini 失敗時把剛扣的那一次退回（盡力而為） */
async function refundPlanQuota(db, user, date) {
    try {
        const ref = quotaRef(db, user.uid, date)
        await db.runTransaction(async (tx) => {
            const snap = await tx.get(ref)
            const count = snap.exists ? Number(snap.get('count') || 0) : 0
            if (count > 0) tx.update(ref, { count: count - 1, updatedAt: FieldValue.serverTimestamp() })
        })
        return true
    } catch (err) {
        console.warn('refundPlanQuota failed:', err && err.message)
        return false
    }
}

module.exports = { PLAN_DAILY_LIMIT, consumePlanQuota, refundPlanQuota }
