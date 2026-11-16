// Google 登入（Firebase Auth）：AI 產生教案必須用 Google 帳號登入，匿名不算
import { initializeApp } from 'firebase/app';
import {
    getAuth,
    GoogleAuthProvider,
    onAuthStateChanged,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    signOut,
} from 'firebase/auth';
import firebaseConfig from './firebase-config.js';

export const DAILY_LIMIT = 5;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
auth.languageCode = 'zh-TW';

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

let currentUser = null;
const listeners = new Set();

function isGoogleUser(user) {
    return !!user && !user.isAnonymous && user.providerData.some(p => p.providerId === 'google.com');
}

export function getSignedInUser() {
    return isGoogleUser(currentUser) ? currentUser : null;
}

export function onUserChange(listener) {
    listeners.add(listener);
    listener(getSignedInUser());
    return () => listeners.delete(listener);
}

onAuthStateChanged(auth, user => {
    // 殘留的匿名身分不算登入，直接登出
    if (user && user.isAnonymous) {
        signOut(auth).catch(() => { });
        user = null;
    }
    currentUser = user;
    listeners.forEach(fn => fn(getSignedInUser()));
});

getRedirectResult(auth).catch(error => console.warn('Google 轉址登入失敗：', error && error.code));

const LOGIN_ERRORS = {
    'auth/popup-closed-by-user': '登入視窗已關閉，請再按一次「使用 Google 帳號登入」。',
    'auth/cancelled-popup-request': '登入視窗已關閉，請再按一次「使用 Google 帳號登入」。',
    'auth/network-request-failed': '網路連線不穩，請確認網路後再試一次。',
    'auth/unauthorized-domain': '此網址尚未授權 Google 登入，請通知管理員。',
};

export async function loginWithGoogle() {
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        const code = error && error.code;
        if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
            // 瀏覽器擋彈出視窗時改用整頁轉址登入
            await signInWithRedirect(auth, provider);
            return;
        }
        throw new Error(LOGIN_ERRORS[code] || 'Google 登入失敗，請稍後再試。');
    }
}

export function logout() {
    return signOut(auth);
}

/** 取得要帶給後端的 ID Token；沒登入回傳 null */
export async function getIdToken() {
    const user = getSignedInUser();
    if (!user) return null;
    return user.getIdToken();
}
