import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getAuthState, subscribeAuth, renderSignInButton, AUTH_MESSAGES } from '../lib/googleAuth'
import { loadFamilyProjects, hasTaskmaniaToken, TASKMANIA_APP_URL } from '../lib/taskmania'

const PICK_KEY = 'homest-taskmania-projects'
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const md = (s) => (s ? `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}` : '')
const WEEK = ['日', '月', '火', '水', '木', '金', '土']
const wd = (s) => WEEK[new Date(`${s}T00:00:00`).getDay()]

// タスクマニアの「家族」タブから、家づくりのプロジェクトをスケジュールとして読む（見るだけ）
export default function Schedule() {
  const [auth, setAuth] = useState(getAuthState())
  const [projects, setProjects] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [picked, setPicked] = useState(() => { try { return JSON.parse(localStorage.getItem(PICK_KEY) || 'null') } catch { return null } })
  const [showDone, setShowDone] = useState(false)
  const btnRef = useRef(null)

  useEffect(() => subscribeAuth(setAuth), [])

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      setProjects(await loadFamilyProjects())
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  // すでにログイン済み（ほかの knak-lab アプリでログインした場合も含む）なら、そのまま読む
  useEffect(() => { if (hasTaskmaniaToken()) load() }, [load])
  // ログインボタンで新しくログインしたら読む
  useEffect(() => { if (auth.signedIn && projects === null && !loading) load() }, [auth.signedIn]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!auth.signedIn && btnRef.current) renderSignInButton(btnRef.current).catch(() => {}) }, [auth.signedIn, projects])

  // 表示するプロジェクト：保存した選択 → なければ名前に「家」を含むもの
  const selectedIds = useMemo(() => {
    if (!projects) return []
    if (picked && picked.some((id) => projects.find((p) => p.id === id))) return picked
    return projects.filter((p) => /家づくり|家|住まい|リノベ|土地/.test(p.name)).map((p) => p.id)
  }, [projects, picked])

  const toggle = (id) => {
    const next = selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]
    setPicked(next)
    try { localStorage.setItem(PICK_KEY, JSON.stringify(next)) } catch { /* noop */ }
  }

  // 予定を1本の時系列にする：タスク（期間）とサブタスク（日付つき）
  const { byMonth, undated, counts } = useMemo(() => {
    const items = []; const undated = []
    let total = 0; let done = 0
    ;(projects || []).filter((p) => selectedIds.includes(p.id)).forEach((p) => {
      ;(p.tasks || []).forEach((t) => {
        const subs = t.subtasks || []
        const tDone = t.done || (subs.length > 0 && subs.every((s) => s.done))
        total++; if (tDone) done++
        const prog = subs.length ? `${subs.filter((s) => s.done).length}/${subs.length}` : ''
        if (t.startDate || t.endDate) items.push({ key: `t-${t.id}`, date: t.startDate || t.endDate, end: t.endDate, title: t.name, kind: 'task', done: tDone, prog, pj: p.name })
        else undated.push({ key: `t-${t.id}`, title: t.name, done: tDone, prog, pj: p.name, subs: subs.filter((s) => !s.scheduledDate) })
        subs.filter((s) => s.scheduledDate).forEach((s) => items.push({ key: `s-${s.id}`, date: s.scheduledDate, time: s.startTime, title: s.text, kind: 'sub', done: s.done, parent: t.name, pj: p.name }))
      })
    })
    const visible = items.filter((i) => showDone || !i.done).sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''))
    const byMonth = {}
    visible.forEach((i) => { const m = i.date.slice(0, 7); (byMonth[m] ||= []).push(i) })
    return { byMonth, undated: undated.filter((u) => showDone || !u.done), counts: { total, done } }
  }, [projects, selectedIds, showDone])

  const today = todayStr()

  // ───── 未接続 ─────
  if (projects === null) {
    return (
      <div className="absolute inset-0 overflow-y-auto p-6">
        <div className="mx-auto max-w-sm space-y-4 text-center">
          <p className="text-3xl">📅</p>
          <p className="text-sm leading-relaxed text-stone-600">
            タスクマニアの「家族」タブにある<br /><b>家づくりのプロジェクト</b>を、ここに予定として表示します（見るだけ）。
          </p>
          {loading ? (
            <p className="text-sm text-stone-500">読み込み中…</p>
          ) : (
            <>
              {(error || auth.error) && (
                <p className="rounded-lg bg-amber-50 p-3 text-left text-xs leading-relaxed text-amber-800">
                  {auth.error ? `${AUTH_MESSAGES[auth.error]?.title}：${AUTH_MESSAGES[auth.error]?.body}` : error}
                </p>
              )}
              {auth.signedIn ? (
                <button className="min-h-11 w-full rounded-lg bg-moss font-bold text-white" onClick={load}>読み込む</button>
              ) : (
                <>
                  <p className="text-xs text-stone-500">タスクマニアと同じGoogleアカウントで接続してください</p>
                  <div ref={btnRef} className="flex justify-center" />
                </>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  // ───── 表示 ─────
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="space-y-2 border-b border-stone-200 bg-paper p-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-stone-500">タスクマニア（家族）</span>
          <span className="text-stone-400">完了 {counts.done}/{counts.total}</span>
          <button className="ml-auto rounded-lg bg-white px-2 py-1.5" onClick={load} disabled={loading}>{loading ? '更新中…' : '↻ 更新'}</button>
          <a className="rounded-lg bg-stone-800 px-2 py-1.5 text-white" href={TASKMANIA_APP_URL} target="_blank" rel="noreferrer">開く ↗</a>
        </div>
        <div className="flex gap-1.5 overflow-x-auto text-xs">
          {projects.map((p) => (
            <button key={p.id} className={`min-h-8 shrink-0 rounded-full px-3 ${selectedIds.includes(p.id) ? 'bg-moss text-white' : 'bg-white text-stone-500'}`} onClick={() => toggle(p.id)}>
              {p.name}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[11px] text-stone-500">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> 完了したものも表示
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-8">
        {error && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">{error}</p>}
        {projects.length === 0 && <p className="mt-10 text-center text-sm text-stone-500">タスクマニアの「家族」タブにプロジェクトがありません。</p>}
        {projects.length > 0 && selectedIds.length === 0 && <p className="mt-10 text-center text-sm text-stone-500">上のチップから、表示するプロジェクトを選んでください。</p>}

        <div className="space-y-5">
          {Object.entries(byMonth).map(([m, list]) => (
            <section key={m}>
              <h3 className="mb-1.5 text-xs font-bold text-stone-500">{Number(m.slice(0, 4))}年{Number(m.slice(5, 7))}月</h3>
              <ul className="space-y-1.5">
                {list.map((i) => {
                  const overdue = !i.done && (i.end || i.date) < today
                  const isToday = i.date === today || (i.end && i.date <= today && today <= i.end)
                  return (
                    <li key={i.key} className={`flex gap-3 rounded-xl px-3 py-2 shadow-sm ${isToday ? 'bg-amber-50 ring-1 ring-amber-300' : 'bg-white'} ${i.done ? 'opacity-50' : ''}`}>
                      <div className="w-12 shrink-0 text-center">
                        <p className={`text-sm font-bold ${overdue ? 'text-rose-600' : ''}`}>{md(i.date)}</p>
                        <p className="text-[10px] text-stone-400">{wd(i.date)}{i.time ? ` ${i.time}` : ''}</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm ${i.done ? 'line-through' : ''} ${i.kind === 'task' ? 'font-bold' : ''}`}>
                          {i.done ? '✓ ' : ''}{i.title}
                        </p>
                        <p className="text-[11px] text-stone-400">
                          {i.kind === 'task'
                            ? <>期間 {md(i.date)}{i.end && i.end !== i.date ? `〜${md(i.end)}` : ''}{i.prog && `・サブタスク ${i.prog}`}</>
                            : <>{i.parent}</>}
                          {overdue && <span className="ml-1 text-rose-600">期限切れ</span>}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}

          {undated.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-xs font-bold text-stone-500">日付未定</h3>
              <ul className="space-y-1.5">
                {undated.map((u) => (
                  <li key={u.key} className={`rounded-xl bg-white px-3 py-2 shadow-sm ${u.done ? 'opacity-50' : ''}`}>
                    <p className={`text-sm font-bold ${u.done ? 'line-through' : ''}`}>{u.done ? '✓ ' : ''}{u.title}</p>
                    {u.prog && <p className="text-[11px] text-stone-400">サブタスク {u.prog}</p>}
                    {u.subs.filter((s) => showDone || !s.done).length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-xs text-stone-600">
                        {u.subs.filter((s) => showDone || !s.done).map((s) => <li key={s.id} className={s.done ? 'line-through opacity-50' : ''}>・{s.text}</li>)}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
