import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getAuthState, subscribeAuth, renderSignInButton, AUTH_MESSAGES } from '../lib/googleAuth'
import { loadFamilyProjects, hasTaskmaniaToken, TASKMANIA_APP_URL } from '../lib/taskmania'

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const md = (s) => (s ? `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}` : '')
const WEEK = ['日', '月', '火', '水', '木', '金', '土']
const wd = (s) => WEEK[new Date(`${s}T00:00:00`).getDay()]

// タスクマニアの「家族」タブの「家づくり」プロジェクトを、ロードマップとサブタスクで見る（見るだけ）
export default function Schedule() {
  const [auth, setAuth] = useState(getAuthState())
  const [projects, setProjects] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [openIds, setOpenIds] = useState([])
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

  // 家族タブの「家づくり」プロジェクトだけを使う
  const pj = useMemo(() => (projects || []).find((p) => p.name.includes('家づくり')) || null, [projects])
  const tasks = useMemo(() => [...(pj?.tasks || [])].sort((x, y) => (x.startDate || '9999').localeCompare(y.startDate || '9999')), [pj])
  const today = todayStr()

  // ───── 未接続 ─────
  if (projects === null) {
    return (
      <div className="absolute inset-0 overflow-y-auto p-6">
        <div className="mx-auto max-w-sm space-y-4 text-center">
          <p className="text-3xl">📅</p>
          <p className="text-sm leading-relaxed text-stone-600">
            タスクマニアの「家族」タブにある<br /><b>家づくり</b>のプロジェクトを、ロードマップとサブタスクで表示します（見るだけ）。
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
  const counts = { total: tasks.length, done: tasks.filter((t) => statusOf(t, today).key === 'done').length }
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex items-center gap-2 border-b border-stone-200 bg-paper p-2 text-xs">
        <span className="font-bold text-stone-600">🏠 家づくり</span>
        <span className="text-stone-400">完了 {counts.done}/{counts.total}</span>
        <button className="ml-auto rounded-lg bg-white px-2 py-1.5" onClick={load} disabled={loading}>{loading ? '更新中…' : '↻ 更新'}</button>
        <a className="rounded-lg bg-stone-800 px-2 py-1.5 text-white" href={TASKMANIA_APP_URL} target="_blank" rel="noreferrer">タスクマニア ↗</a>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-8">
        {error && <p className="m-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">{error}</p>}
        {!pj ? (
          <p className="mt-10 px-6 text-center text-sm leading-relaxed text-stone-500">
            タスクマニアの「家族」タブに、名前に「家づくり」を含むプロジェクトが見つかりませんでした。
          </p>
        ) : (
          <>
            <Roadmap tasks={tasks} today={today} openIds={openIds} onSelect={(id) => {
              setOpenIds((o) => (o.includes(id) ? o : [...o, id]))
              setTimeout(() => document.getElementById(`task-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
            }} />
            <SubtaskList tasks={tasks} today={today} openIds={openIds} setOpenIds={setOpenIds} showDone={showDone} setShowDone={setShowDone} />
          </>
        )}
      </div>
    </div>
  )
}

// ───── 状態（タスクマニアのロードマップと同じ考え方） ─────
const STATUS = {
  upcoming: { key: 'upcoming', label: '予定', color: '#8E99A4' },
  active: { key: 'active', label: '進行中', color: '#12314F' },
  overdue: { key: 'overdue', label: '遅延', color: '#D64550' },
  done: { key: 'done', label: '完了', color: '#7E9C83' },
  none: { key: 'none', label: '日付未定', color: '#C8C2B8' },
}
function statusOf(t, today) {
  const subs = t.subtasks || []
  const d = subs.filter((x) => x.done).length
  if (t.done || (subs.length > 0 && d === subs.length)) return STATUS.done
  if (!t.startDate && !t.endDate) return STATUS.none
  if ((t.endDate || t.startDate) < today) return STATUS.overdue
  if ((t.startDate || t.endDate) <= today) return STATUS.active
  return STATUS.upcoming
}
const pctOf = (t) => {
  const subs = t.subtasks || []
  if (!subs.length) return t.done ? 100 : 0
  return Math.round((subs.filter((x) => x.done).length / subs.length) * 100)
}
const dnum = (s) => new Date(`${s}T00:00:00`).getTime() / 864e5
const addMonth = (y, m, n) => { const d = new Date(y, m - 1 + n, 1); return [d.getFullYear(), d.getMonth() + 1] }
const SPANS = [3, 6, 12]

// ───── ロードマップ：左に固定のタスク名、右に月ごとの横スクロール ─────
function Roadmap({ tasks, today, openIds, onSelect }) {
  const [span, setSpan] = useState(() => { try { const v = Number(localStorage.getItem('homest-roadmap-span')); return SPANS.includes(v) ? v : 6 } catch { return 6 } })
  const dated = tasks.filter((t) => t.startDate || t.endDate)
  const first = dated.reduce((m, t) => { const s = t.startDate || t.endDate; return !m || s < m ? s : m }, null) || today
  const startKey = (first < today ? first : today).slice(0, 7)
  const [y0, m0] = startKey.split('-').map(Number)
  const months = Array.from({ length: span }, (_, i) => addMonth(y0, m0, i))
  const MONTH_W = span === 12 ? 56 : span === 6 ? 84 : 120
  const start = dnum(`${months[0][0]}-${String(months[0][1]).padStart(2, '0')}-01`)
  const [ey, em] = addMonth(months[span - 1][0], months[span - 1][1], 1)
  const end = dnum(`${ey}-${String(em).padStart(2, '0')}-01`)
  const W = MONTH_W * span
  const x = (s) => ((dnum(s) - start) / (end - start)) * W
  const todayX = x(today)
  const setSp = (v) => { setSpan(v); try { localStorage.setItem('homest-roadmap-span', String(v)) } catch { /* noop */ } }

  return (
    <section className="border-b border-stone-200 bg-white">
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <h3 className="text-sm font-bold">ロードマップ</h3>
        <div className="ml-auto flex rounded-lg bg-stone-100 p-0.5 text-[11px]">
          {SPANS.map((v) => (
            <button key={v} className={`rounded-md px-2 py-1 ${span === v ? 'bg-white font-bold shadow' : 'text-stone-500'}`} onClick={() => setSp(v)}>{v}か月</button>
          ))}
        </div>
      </div>
      <div className="flex">
        {/* 左：タスク名（固定） */}
        <div className="w-28 shrink-0 border-r border-stone-200">
          <div className="h-7 border-b border-stone-200" />
          {tasks.map((t) => (
            <button key={t.id} className={`flex h-11 w-full items-center gap-1.5 border-b border-stone-100 px-2 text-left text-xs ${openIds.includes(t.id) ? 'bg-amber-50 font-bold' : ''}`} onClick={() => onSelect(t.id)}>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: statusOf(t, today).color }} />
              <span className="line-clamp-2 break-all">{t.name}</span>
            </button>
          ))}
        </div>
        {/* 右：月のグリッドとバー（横スクロール） */}
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="relative" style={{ width: W }}>
            <div className="flex h-7 border-b border-stone-200 text-[10px] text-stone-500">
              {months.map(([yy, mm], i) => (
                <div key={i} className="flex items-center border-r border-stone-100 px-1" style={{ width: MONTH_W }}>
                  {mm === 1 || i === 0 ? `${yy}/${mm}月` : `${mm}月`}
                </div>
              ))}
            </div>
            {tasks.map((t) => {
              const st = statusOf(t, today)
              const s = t.startDate || t.endDate; const e = t.endDate || t.startDate
              const left = s ? Math.max(0, x(s)) : 0
              const right = e ? Math.min(W, x(e) + MONTH_W / 30) : 0
              const width = Math.max(10, right - left)
              const visible = s && right > 0 && left < W
              const pct = pctOf(t)
              return (
                <div key={t.id} className={`relative h-11 border-b border-stone-100 ${openIds.includes(t.id) ? 'bg-amber-50' : ''}`} onClick={() => onSelect(t.id)}>
                  {months.map((_, i) => <div key={i} className="absolute top-0 bottom-0 border-r border-stone-100" style={{ left: (i + 1) * MONTH_W - 1 }} />)}
                  {visible && (
                    <div className="absolute top-2.5 h-6 overflow-hidden rounded-md" style={{ left, width, background: `${st.color}33`, border: `1.5px solid ${st.color}` }}>
                      <div className="h-full" style={{ width: `${pct}%`, background: `${st.color}88` }} />
                      <span className="absolute inset-0 flex items-center px-1.5 text-[10px] font-bold whitespace-nowrap" style={{ color: st.key === 'active' ? '#12314F' : '#2b2620' }}>{pct}%</span>
                    </div>
                  )}
                  {!s && <span className="absolute top-3.5 left-2 text-[10px] text-stone-400">日付未定</span>}
                </div>
              )
            })}
            {todayX >= 0 && todayX <= W && (
              <div className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-rose-500/70" style={{ left: todayX }}>
                <span className="absolute bottom-0 left-1 rounded bg-rose-500 px-1 text-[9px] whitespace-nowrap text-white">今日</span>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-3 px-3 py-2 text-[10px] text-stone-500">
        {['upcoming', 'active', 'overdue', 'done'].map((k) => (
          <span key={k} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: STATUS[k].color }} />{STATUS[k].label}</span>
        ))}
        <span className="text-stone-400">バーの濃い部分＝サブタスクの進み具合</span>
      </div>
    </section>
  )
}

// ───── サブタスク：タスクごとに一覧 ─────
function SubtaskList({ tasks, today, openIds, setOpenIds, showDone, setShowDone }) {
  const list = tasks
  const toggle = (id) => setOpenIds((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]))
  const allOpen = tasks.length > 0 && tasks.every((t) => openIds.includes(t.id))
  return (
    <section className="p-3">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-bold">タスク</h3>
        <button className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-600" onClick={() => setOpenIds(allOpen ? [] : tasks.map((t) => t.id))}>{allOpen ? 'すべてたたむ' : 'すべて開く'}</button>
        <label className="ml-auto flex items-center gap-1 text-[11px] text-stone-500">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> 完了も表示
        </label>
      </div>
      <div className="space-y-3">
        {list.map((t) => {
          const st = statusOf(t, today)
          const subs = [...(t.subtasks || [])].sort((a, b) => (a.scheduledDate || '9999').localeCompare(b.scheduledDate || '9999'))
          const shown = subs.filter((x) => showDone || !x.done)
          return (
            <div key={t.id} id={`task-${t.id}`} className="scroll-mt-2 rounded-xl bg-white shadow-sm">
              <button className="block w-full p-3 text-left" onClick={() => toggle(t.id)}>
                <div className="flex items-center gap-2">
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: st.color }}>{st.label}</span>
                  <p className="min-w-0 flex-1 truncate text-sm font-bold">{t.name}</p>
                  <span className="text-[11px] text-stone-400">{subs.filter((x) => x.done).length}/{subs.length}</span>
                  <span className="text-xs text-stone-400">{openIds.includes(t.id) ? '▾' : '▸'}</span>
                </div>
                {(t.startDate || t.endDate) && <p className="mt-1 text-[11px] text-stone-400">期間 {md(t.startDate || t.endDate)}{t.endDate && t.endDate !== t.startDate ? `〜${md(t.endDate)}` : ''}</p>}
              </button>
              {openIds.includes(t.id) && <div className="px-3 pb-3">{shown.length === 0 ? (
                <p className="text-xs text-stone-400">{subs.length ? 'すべて完了しています' : 'サブタスクはありません'}</p>
              ) : (
                <ul className="divide-y divide-stone-100">
                  {shown.map((x) => {
                    const overdue = !x.done && x.scheduledDate && x.scheduledDate < today
                    const isToday = x.scheduledDate === today
                    return (
                      <li key={x.id} className={`flex items-start gap-2 py-1.5 text-sm ${x.done ? 'text-stone-400' : ''}`}>
                        <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${x.done ? 'border-moss bg-moss text-white' : 'border-stone-300'}`}>{x.done ? '✓' : ''}</span>
                        <span className={`min-w-0 flex-1 ${x.done ? 'line-through' : ''}`}>{x.text}</span>
                        {x.scheduledDate && (
                          <span className={`shrink-0 text-[11px] ${overdue ? 'font-bold text-rose-600' : isToday ? 'font-bold text-amber-700' : 'text-stone-400'}`}>
                            {md(x.scheduledDate)}({wd(x.scheduledDate)}){x.startTime ? ` ${x.startTime}` : ''}
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}</div>}
            </div>
          )
        })}
      </div>
    </section>
  )
}
