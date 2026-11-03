import { useCallback, useEffect, useState } from 'react'
import { supabase, isConfigured } from './lib/supabase'
import { Login, HouseholdSetup } from './components/Auth'
import BottomSheet from './components/BottomSheet'
import MindMap from './tabs/MindMap'
import Priority from './tabs/Priority'
import Lands from './tabs/Lands'
import Builders from './tabs/Builders'
import Budget from './tabs/Budget'
import Schedule from './tabs/Schedule'

// ?embed=budget のときは予算画面だけを表示する（お金ちゃんの「家」タブに埋め込む用）
const EMBED = new URLSearchParams(window.location.search).get('embed')

const TABS = [
  { id: 'mindmap', label: '暮らし', icon: '🌱' },
  { id: 'priority', label: '優先順位', icon: '⭐' },
  { id: 'land', label: '土地', icon: '🗺️' },
  { id: 'builder', label: '建物', icon: '🏠' },
  { id: 'budget', label: '予算', icon: '💰' },
  { id: 'schedule', label: '予定', icon: '📅' },
]

export default function App() {
  const [session, setSession] = useState(undefined)
  const [ctx, setCtx] = useState(undefined) // { household, members, me }
  const [tab, setTab] = useState('mindmap')
  const [settings, setSettings] = useState(false)

  useEffect(() => {
    if (!isConfigured) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const loadContext = useCallback(async () => {
    if (!session) return
    const uid = session.user.id
    const { data: mine, error } = await supabase.from('members').select('household_id').eq('user_id', uid).limit(1)
    if (error) return alert(error.message)
    if (!mine.length) return setCtx(null)
    const hid = mine[0].household_id
    const [{ data: household }, { data: members }] = await Promise.all([
      supabase.from('households').select('*').eq('id', hid).single(),
      supabase.from('members').select('*').eq('household_id', hid).order('created_at'),
    ])
    setCtx({ household, members, me: members.find((m) => m.user_id === uid) })
  }, [session])

  useEffect(() => { loadContext() }, [loadContext])

  // 埋め込み時：別タブでログインしてから戻ってきたら、ログイン状態を読み直す
  useEffect(() => {
    if (!EMBED || !isConfigured) return
    const onVis = () => {
      if (document.visibilityState === 'visible') supabase.auth.getSession().then(({ data }) => setSession(data.session))
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  if (!isConfigured) {
    return <div className="p-6 text-sm">Supabase の接続設定（VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY）がありません。docs/setup.md を見て設定してください。</div>
  }
  if (session === undefined) return null
  if (EMBED) {
    // 埋め込み先ではGoogleログインができないので、homest本体でログインしてもらう（同じドメインなのでログイン状態は共有される）
    if (!session || ctx === null) {
      return (
        <div className="p-6 text-center text-sm leading-relaxed text-stone-600">
          <p>{session ? 'homestで世帯を作成・参加してください。' : 'homestにログインすると、家の予算がここに表示されます。'}</p>
          <a className="mt-3 inline-block rounded-xl bg-moss px-5 py-3 font-bold text-white" href={window.location.pathname} target="_blank" rel="noreferrer">homestを開く</a>
          <p className="mt-2 text-xs text-stone-400">ログイン後、この画面に戻ると表示されます</p>
        </div>
      )
    }
    if (ctx === undefined) return null
    return <Budget ctx={ctx} embedded />
  }
  if (!session) return <Login />
  if (ctx === undefined) return null
  if (ctx === null) return <HouseholdSetup onDone={loadContext} />

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-stone-200 bg-paper px-4 py-2">
        <span className="text-lg font-black text-moss">homest</span>
        <button className="min-h-10 px-2 text-sm text-stone-600" onClick={() => setSettings(true)}>⚙️ 設定</button>
      </header>

      <main className="relative min-h-0 flex-1">
        {tab === 'mindmap' && <MindMap ctx={ctx} />}
        {tab === 'priority' && <Priority ctx={ctx} />}
        {tab === 'land' && <Lands ctx={ctx} />}
        {tab === 'builder' && <Builders ctx={ctx} />}
        {tab === 'budget' && <Budget ctx={ctx} />}
        {tab === 'schedule' && <Schedule />}
      </main>

      <nav className="grid grid-cols-6 border-t border-stone-200 bg-white safe-bottom">
        {TABS.map((t) => (
          <button key={t.id} className={`flex min-h-14 flex-col items-center justify-center text-xs ${tab === t.id ? 'font-bold text-moss' : 'text-stone-400'}`} onClick={() => setTab(t.id)}>
            <span className="text-lg leading-none">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      <Settings open={settings} onClose={() => setSettings(false)} ctx={ctx} reload={loadContext} />
    </div>
  )
}

function Settings({ open, onClose, ctx, reload }) {
  const [name, setName] = useState(ctx.me.display_name)
  const inviteUrl = `${window.location.origin}${window.location.pathname}?join=${ctx.household.invite_code}`

  const [hname, setHname] = useState(ctx.household.name)
  const saveHname = async () => {
    const { error } = await supabase.from('households').update({ name: hname.trim() || 'わが家' }).eq('id', ctx.household.id)
    if (error) return alert(error.message)
    reload()
  }
  const saveName = async () => {
    await supabase.from('members').update({ display_name: name }).eq('user_id', ctx.me.user_id).eq('household_id', ctx.household.id)
    reload()
  }
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'homest に参加', url: inviteUrl })
      else { await navigator.clipboard.writeText(inviteUrl); alert('招待リンクをコピーしました') }
    } catch { /* キャンセル */ }
  }

  return (
    <BottomSheet open={open} title="設定" onClose={onClose}>
      <div className="space-y-5 text-sm">
        <section>
          <p className="mb-1 font-bold">あなたの表示名</p>
          <div className="flex gap-2">
            <input className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="rounded-lg bg-stone-800 px-3 text-white" onClick={saveName}>保存</button>
          </div>
        </section>
        <section>
          <p className="mb-1 font-bold">世帯の名前</p>
          <div className="flex gap-2">
            <input className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2" value={hname} onChange={(e) => setHname(e.target.value)} />
            <button className="rounded-lg bg-stone-800 px-3 text-white" onClick={saveHname}>保存</button>
          </div>
        </section>
        <section>
          <p className="mb-1 font-bold">メンバー</p>
          {ctx.members.map((m) => (
            <p key={m.user_id} className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full" style={{ background: m.color }} />{m.display_name}</p>
          ))}
          {ctx.members.length < 2 && (
            <div className="mt-2 rounded-lg bg-stone-100 p-3">
              <p className="mb-2">パートナーを招待する（招待コード：<b>{ctx.household.invite_code}</b>）</p>
              <button className="min-h-11 w-full rounded-lg bg-moss text-white" onClick={share}>招待リンクを送る</button>
            </div>
          )}
        </section>
        <button className="min-h-11 w-full rounded-lg border border-stone-300 text-stone-600" onClick={() => supabase.auth.signOut()}>ログアウト</button>
      </div>
    </BottomSheet>
  )
}
