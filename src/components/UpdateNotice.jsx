import { useEffect, useState } from 'react'

// 新しい版がデプロイされていたら、画面下にお知らせを出す（タスクマニアと同じしくみ）。
// ホーム画面に追加したアプリは前の画面が残ったままになりやすく、デプロイしても古い版のまま動き続けるため。
// 入力途中の内容を消さないよう、自動では再読み込みせず、「更新」を押してもらってから読み込み直す。
const SCRIPT_RE = /assets\/index-[\w-]+\.js/
const CHECK_EVERY_MS = 30 * 60 * 1000

function currentScript() {
  const el = [...document.querySelectorAll('script[type="module"][src]')].find((s) => SCRIPT_RE.test(s.src))
  return el ? el.src.match(SCRIPT_RE)[0] : null
}

async function latestScript() {
  // cache: 'reload' でサーバーから取り直し、ブラウザの保存分も新しい版に置き換える
  const res = await fetch(`${import.meta.env.BASE_URL}index.html`, { cache: 'reload' })
  if (!res.ok) return null
  const m = (await res.text()).match(SCRIPT_RE)
  return m ? m[0] : null
}

export default function UpdateNotice() {
  const [hasUpdate, setHasUpdate] = useState(false)

  useEffect(() => {
    if (!import.meta.env.PROD) return
    const mine = currentScript()
    if (!mine) return
    let stopped = false
    const check = async () => {
      try {
        const latest = await latestScript()
        if (!stopped && latest && latest !== mine) setHasUpdate(true)
      } catch { /* オフラインなどは気にしない */ }
    }
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    const first = setTimeout(check, 3000)
    const timer = setInterval(check, CHECK_EVERY_MS)
    document.addEventListener('visibilitychange', onVisible)
    return () => { stopped = true; clearTimeout(first); clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [])

  if (!hasUpdate) return null
  return (
    <div role="status" className="fixed bottom-20 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-3 rounded-full bg-stone-800 py-2 pr-2 pl-4 text-sm font-bold whitespace-nowrap text-white shadow-lg">
      <span>新しい版があります</span>
      <button className="rounded-full bg-moss px-4 py-1.5 text-white" onClick={() => window.location.reload()}>更新</button>
      <button aria-label="閉じる" className="px-1 text-lg leading-none text-stone-300" onClick={() => setHasUpdate(false)}>×</button>
    </div>
  )
}
