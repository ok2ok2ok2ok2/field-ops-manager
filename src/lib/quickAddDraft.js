/**
 * 快速輸入草稿接收
 * 版本: v1.0
 * 日期: 2026-09-07
 * 檔案: src/lib/quickAddDraft.js
 *
 * Android 分享選單（manifest share_target）與桌面捷徑（?quickadd=1）
 * 都是帶查詢參數落在 '/'。沒登入時 ProtectedRoute 會把網址 replace 到
 * /login，參數就沒了，分享過來的字會無聲消失。
 *
 * 所以在「模組載入時」就把參數收下來 —— 這比 React 開始渲染早，
 * 更早於任何轉址。順手也寫一份到 sessionStorage，萬一登入流程是整頁
 * 重載而不是前端轉址，重載後還撿得回來。
 *
 * ⚠ 不要把這段搬進 component 的 useState lazy initializer：
 * StrictMode 開發模式會呼叫兩次，第一次讀完就清掉，第二次拿到空的。
 */

let draft = null

try {
  const sp = new URLSearchParams(window.location.search)
  const shared = [sp.get('title'), sp.get('text'), sp.get('url')]
    .filter(Boolean)
    .join(' ')

  if (shared || sp.has('quickadd')) {
    draft = shared
    sessionStorage.setItem('quickadd-draft', shared)
  } else {
    const saved = sessionStorage.getItem('quickadd-draft')
    if (saved !== null) draft = saved
  }
} catch (err) {
  // 無痕模式 / 擋 cookie 時 sessionStorage 會直接丟例外
  console.warn('[quickadd] 草稿接收失敗，略過', err)
}

/** 這次頁面載入是不是從分享或捷徑進來的（是的話回傳文字，可能是空字串） */
export function getQuickAddDraft() {
  return draft
}

/** 收下之後清掉，重新整理或元件重掛都不會又冒出同一份 */
export function clearQuickAddDraft() {
  draft = null
  try {
    sessionStorage.removeItem('quickadd-draft')
  } catch {
    // 讀不到就算了，記憶體那份已經清掉
  }
}
