import { useState } from 'react'
import { supabase, authErrorFromUrl } from '../lib/supabase'

export function Login() {
  const [email, setEmail] = useState(() => localStorage.getItem('homest-email') || '')
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(
    authErrorFromUrl ? 'ログインリンクが使えませんでした（期限切れ・使用済みの可能性）。下からもう一度送ってください。' : '',
  )

  const [showEmail, setShowEmail] = useState(false)

  const google = async () => {
    setBusy(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname + window.location.search },
    })
    if (error) { setBusy(false); alert(error.message) }
  }

  const send = async () => {
    const e = email.trim()
    if (!e) return
    setBusy(true)
    const { error } = await supabase.auth.signInWithOtp({
      email: e,
      options: { emailRedirectTo: window.location.origin + window.location.pathname + window.location.search },
    })
    setBusy(false)
    if (error) return alert(error.message)
    localStorage.setItem('homest-email', e)
    setNotice('')
    setSent(true)
  }

  const verify = async () => {
    const token = code.replace(/\D/g, '')
    if (token.length < 6) return
    setBusy(true)
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: 'email' })
    setBusy(false)
    if (error) alert('コードが正しくないか、期限が切れています。もう一度送ってください。\n' + error.message)
    // 成功すると onAuthStateChange で自動的に画面が切り替わる
  }

  return (
    <Shell>
      {notice && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">{notice}</p>}
      {sent ? (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed">
            {email} にメールを送りました。<br />
            メールに書かれた<b>コード</b>をここに入力してください。
          </p>
          <input
            className="w-full rounded-lg border border-stone-300 px-3 py-3 text-center text-2xl tracking-[0.4em]"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={10}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button disabled={busy} className="min-h-12 w-full rounded-lg bg-moss font-bold text-white disabled:opacity-40" onClick={verify}>
            ログイン
          </button>
          <p className="text-xs leading-relaxed text-stone-500">
            ※メールのリンクをタップしてもログインできますが、メールアプリ内のブラウザで開くとログイン状態が普段のブラウザに残らないことがあります。コード入力がおすすめです。
          </p>
          <button className="min-h-11 w-full text-sm text-stone-500 underline" onClick={() => { setSent(false); setCode('') }}>
            メールアドレスを変える／送り直す
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <button disabled={busy} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white font-bold disabled:opacity-40" onClick={google}>
            <span className="text-lg">G</span> Googleでログイン
          </button>
          {!showEmail ? (
            <button className="min-h-11 w-full text-xs text-stone-500 underline" onClick={() => setShowEmail(true)}>メールで受け取る（予備）</button>
          ) : (
            <>
              <input
                className="w-full rounded-lg border border-stone-300 px-3 py-3"
                type="email"
                placeholder="メールアドレス"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button disabled={busy} className="min-h-12 w-full rounded-lg bg-stone-700 text-sm text-white disabled:opacity-40" onClick={send}>
                ログイン用メールを送る
              </button>
            </>
          )}
        </div>
      )}
    </Shell>
  )
}

export function HouseholdSetup({ onDone }) {
  const params = new URLSearchParams(window.location.search)
  const [mode, setMode] = useState(params.get('join') ? 'join' : 'create')
  const [name, setName] = useState('わが家')
  const [code, setCode] = useState(params.get('join') || '')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!displayName.trim()) return alert('表示名を入れてください')
    setBusy(true)
    const { error } = mode === 'create'
      ? await supabase.rpc('create_household', { p_name: name, p_display_name: displayName.trim() })
      : await supabase.rpc('join_household', { p_code: code, p_display_name: displayName.trim() })
    setBusy(false)
    if (error) return alert(error.message)
    window.history.replaceState(null, '', window.location.pathname)
    onDone()
  }

  return (
    <Shell>
      <div className="mb-4 grid grid-cols-2 rounded-lg bg-stone-200 p-1 text-sm">
        {[['create', '新しく始める'], ['join', '招待コードで参加']].map(([m, l]) => (
          <button key={m} className={`min-h-10 rounded-md ${mode === m ? 'bg-white font-bold shadow' : ''}`} onClick={() => setMode(m)}>{l}</button>
        ))}
      </div>
      <div className="space-y-3">
        <input className="w-full rounded-lg border border-stone-300 px-3 py-3" placeholder="あなたの表示名（例：しょう）" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        {mode === 'create' ? (
          <input className="w-full rounded-lg border border-stone-300 px-3 py-3" placeholder="世帯の名前" value={name} onChange={(e) => setName(e.target.value)} />
        ) : (
          <input className="w-full rounded-lg border border-stone-300 px-3 py-3" placeholder="招待コード" value={code} onChange={(e) => setCode(e.target.value)} />
        )}
        <button disabled={busy} className="min-h-12 w-full rounded-lg bg-moss font-bold text-white disabled:opacity-40" onClick={submit}>
          {mode === 'create' ? 'はじめる' : '参加する'}
        </button>
      </div>
    </Shell>
  )
}

function Shell({ children }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6">
      <h1 className="mb-1 text-3xl font-black tracking-wide text-moss">homest</h1>
      <p className="mb-8 text-sm text-stone-500">ふたりの家づくりノート</p>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  )
}
