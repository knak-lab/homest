import { useState } from 'react'
import { supabase } from '../lib/supabase'

export function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  const send = async () => {
    if (!email.trim()) return
    setBusy(true)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.href },
    })
    setBusy(false)
    if (error) return alert(error.message)
    setSent(true)
  }

  return (
    <Shell>
      {sent ? (
        <p className="text-center text-sm leading-relaxed">
          {email} にログイン用のリンクを送りました。<br />メールを開いてリンクをタップしてください。
        </p>
      ) : (
        <div className="space-y-3">
          <input
            className="w-full rounded-lg border border-stone-300 px-3 py-3"
            type="email"
            placeholder="メールアドレス"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button disabled={busy} className="min-h-12 w-full rounded-lg bg-moss font-bold text-white disabled:opacity-40" onClick={send}>
            ログインリンクを送る
          </button>
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
