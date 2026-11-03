import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getAuthState, subscribeAuth, renderSignInButton, AUTH_MESSAGES } from '../lib/googleAuth'
import { loadFamilyProjects, hasTaskmaniaToken, applyOps, TASKMANIA_APP_URL } from '../lib/taskmania'
import BottomSheet from '../components/BottomSheet'

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const md = (s) => (s ? `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}` : '')
const WEEK = ['日', '月', '火', '水', '木', '金', '土']
const wd = (s) => WEEK[new Date(`${s}T00:00:00`).getDay()]

// タスクマニアの「家族」タブの「家づくり」プロジェクトを、ロードマップとサブタスクで見る
// （サブタスクの完了・追加・日付変更はここからでき、タスクマニアに保存される。削除はタスクマニア本体で）
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

  // 先に画面を変えてから保存し、保存後のタスクマニアの内容で置き換える
  const [saving, setSaving] = useState(false)
  const mutate = async (ops, optimistic) => {
    if (optimistic) setProjects((ps) => optimistic(ps))
    setSaving(true); setError('')
    try {
      setProjects(await applyOps(ops))
    } catch (e) {
      setError(`保存できませんでした：${e.message || e}`)
      load()
    } finally {
      setSaving(false)
    }
  }
  const patchSub = (id, fields) => (ps) => ps.map((p) => ({ ...p, tasks: (p.tasks || []).map((t) => ({ ...t, subtasks: (t.subtasks || []).map((x) => (x.id === id ? { ...x, ...fields } : x)) })) }))

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
        {saving && <span className="text-amber-700">保存中…</span>}
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
            <SubtaskList tasks={tasks} today={today} openIds={openIds} setOpenIds={setOpenIds} showDone={showDone} setShowDone={setShowDone} mutate={mutate} patchSub={patchSub} />
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
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const LANE_H = 30
const MONTH_W = 84

// ───── ロードマップ：タスクマニアと同じく、PJを1行にしてタスクを矢羽根で並べる ─────
// 表示範囲は「最初のタスク（か今日）の月」から「すべてのタスクが終わる月」まで
function Roadmap({ tasks, today, openIds, onSelect }) {
  const dated = tasks.filter((t) => t.startDate || t.endDate).map((t) => ({ t, s: t.startDate || t.endDate, e: t.endDate || t.startDate }))
  const minS = dated.reduce((m, it) => (it.s < m ? it.s : m), today)
  const maxE = dated.reduce((m, it) => (it.e > m ? it.e : m), today)
  const [y0, m0] = minS.slice(0, 7).split('-').map(Number)
  const [y1, m1] = maxE.slice(0, 7).split('-').map(Number)
  const span = (y1 - y0) * 12 + (m1 - m0) + 1
  const months = Array.from({ length: span }, (_, i) => addMonth(y0, m0, i))
  const start = dnum(`${months[0][0]}-${String(months[0][1]).padStart(2, '0')}-01`)
  const [ey, em] = addMonth(y1, m1, 1)
  const end = dnum(`${ey}-${String(em).padStart(2, '0')}-01`)
  const W = MONTH_W * span
  const x = (sd, endOfDay = false) => ((dnum(sd) + (endOfDay ? 1 : 0) - start) / (end - start)) * W
  const todayX = x(today)

  // 重なるタスクは段（レーン）を分ける
  const laneEnds = []
  const bars = [...dated].sort((a, b) => a.s.localeCompare(b.s)).map((it) => {
    let lane = laneEnds.findIndex((e) => e < it.s)
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(it.e) } else laneEnds[lane] = it.e
    return { ...it, lane }
  })
  const lanes = Math.max(1, laneEnds.length)
  const undatedCount = tasks.length - dated.length

  return (
    <section className="border-b border-stone-200 bg-white">
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <h3 className="text-sm font-bold">ロードマップ</h3>
        <span className="text-[11px] text-stone-400">{months[0][0]}/{months[0][1]}〜{y1}/{m1}</span>
        {undatedCount > 0 && <span className="ml-auto text-[11px] text-stone-400">日付未定 {undatedCount}件は下の一覧に</span>}
      </div>
      <div className="flex">
        <div className="flex w-16 shrink-0 flex-col border-r border-stone-200">
          <div className="h-7 border-b border-stone-200" />
          <div className="flex flex-1 items-center justify-center px-1 text-center text-[11px] font-bold text-stone-600">家づくり</div>
        </div>
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="relative" style={{ width: W }}>
            <div className="flex h-7 border-b border-stone-200 text-[10px] text-stone-500">
              {months.map(([yy, mm], i) => (
                <div key={i} className="flex shrink-0 items-center border-r border-stone-100 px-1" style={{ width: MONTH_W }}>
                  {mm === 1 || i === 0 ? `${yy}/${mm}月` : `${mm}月`}
                </div>
              ))}
            </div>
            <div className="relative" style={{ height: lanes * LANE_H + 10 }}>
              {months.map((_, i) => <div key={i} className="absolute top-0 bottom-0 border-r border-stone-100" style={{ left: (i + 1) * MONTH_W - 1 }} />)}
              {bars.map(({ t, s, e, lane }) => {
                const st = statusOf(t, today)
                const left = x(s); const w = Math.max(26, x(e, true) - left)
                const pct = pctOf(t)
                const on = openIds.includes(t.id)
                return (
                  <button key={t.id} onClick={() => onSelect(t.id)}
                    className="absolute flex items-center overflow-hidden pr-3 pl-3 text-left text-[11px] font-bold text-white"
                    style={{
                      left, width: w, top: 5 + lane * LANE_H, height: LANE_H - 4,
                      clipPath: 'polygon(0 0, calc(100% - 9px) 0, 100% 50%, calc(100% - 9px) 100%, 0 100%, 9px 50%)',
                      background: `linear-gradient(to right, ${st.color} ${pct}%, color-mix(in srgb, ${st.color} 62%, #fff) ${pct}%)`,
                      textShadow: '0 0 2px rgba(0,0,0,.35)',
                      filter: on ? 'brightness(1.15) saturate(1.2)' : 'none',
                    }}>
                    <span className="truncate">{on ? '▾ ' : ''}{t.name}</span>
                  </button>
                )
              })}
              {todayX >= 0 && todayX <= W && (
                <div className="pointer-events-none absolute top-0 bottom-0 z-10 w-0 border-l-2 border-rose-500/80" style={{ left: todayX }} />
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-3 px-3 py-2 text-[10px] text-stone-500">
        {['upcoming', 'active', 'overdue', 'done'].map((k) => (
          <span key={k} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: STATUS[k].color }} />{STATUS[k].label}</span>
        ))}
        <span className="flex items-center gap-1"><span className="h-3 w-0 border-l-2 border-rose-500" />今日</span>
        <span className="text-stone-400">濃い部分＝進み具合・タップで下の一覧が開きます</span>
      </div>
    </section>
  )
}

// ───── サブタスク：タスクごとに一覧 ─────
function SubtaskList({ tasks, today, openIds, setOpenIds, showDone, setShowDone, mutate, patchSub }) {
  const [edit, setEdit] = useState(null) // { taskId, sub? }
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
                      <li key={x.id} className={`flex items-center gap-2 py-1 text-sm ${x.done ? 'text-stone-400' : ''}`}>
                        <button className="-m-1 p-2" aria-label="完了" onClick={() => mutate([{ op: 'complete', kind: 'subtask', id: x.id, done: !x.done }], patchSub(x.id, { done: !x.done }))}>
                          <span className={`flex h-5 w-5 items-center justify-center rounded border text-[11px] ${x.done ? 'border-moss bg-moss text-white' : 'border-stone-300 bg-white'}`}>{x.done ? '✓' : ''}</span>
                        </button>
                        <button className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left" onClick={() => setEdit({ taskId: t.id, sub: x })}>
                          <span className={`min-w-0 flex-1 ${x.done ? 'line-through' : ''}`}>{x.text}</span>
                          <span className={`shrink-0 text-[11px] ${overdue ? 'font-bold text-rose-600' : isToday ? 'font-bold text-amber-700' : 'text-stone-400'}`}>
                            {x.scheduledDate ? `${md(x.scheduledDate)}(${wd(x.scheduledDate)})${x.startTime ? ` ${x.startTime}` : ''}` : '日付 ＋'}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
              <button className="mt-1 min-h-10 w-full rounded-lg border border-dashed border-stone-300 text-xs text-stone-500" onClick={() => setEdit({ taskId: t.id })}>＋ サブタスクを追加</button>
              </div>}
            </div>
          )
        })}
      </div>
      {edit && (
        <SubtaskSheet
          task={tasks.find((t) => t.id === edit.taskId)}
          sub={edit.sub}
          onClose={() => setEdit(null)}
          onSave={(v) => {
            if (edit.sub) mutate([{ op: 'update', kind: 'subtask', id: edit.sub.id, fields: v }], patchSub(edit.sub.id, v))
            else mutate([{ op: 'addSubtask', taskId: edit.taskId, subtask: v }])
            setEdit(null)
          }}
        />
      )}
    </section>
  )
}

// サブタスクの追加・変更（内容・日付・時間）
function SubtaskSheet({ task, sub, onSave, onClose }) {
  const [text, setText] = useState(sub?.text ?? '')
  const [date, setDate] = useState(sub?.scheduledDate ?? '')
  const [time, setTime] = useState(sub?.startTime ?? '')
  const plus = (n) => { const d = new Date(); d.setDate(d.getDate() + n); setDate(ymd(d)) }
  const input = 'w-full rounded-lg border border-stone-300 px-3 py-2'
  return (
    <BottomSheet open title={sub ? 'サブタスクを変更' : `「${task?.name}」に追加`} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <input autoFocus={!sub} className={`${input} py-3 text-base`} placeholder="やること（例：〇〇工務店に見学の予約）" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="grid grid-cols-[1fr_7rem] gap-2">
          <div>
            <span className="mb-1 block text-xs text-stone-500">日付</span>
            <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <span className="mb-1 block text-xs text-stone-500">時間（任意）</span>
            <input type="time" className={input} value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs">
          <button className="rounded-full bg-stone-100 px-3 py-1.5" onClick={() => plus(0)}>今日</button>
          <button className="rounded-full bg-stone-100 px-3 py-1.5" onClick={() => plus(1)}>明日</button>
          <button className="rounded-full bg-stone-100 px-3 py-1.5" onClick={() => plus(7)}>1週間後</button>
          <button className="rounded-full bg-stone-100 px-3 py-1.5" onClick={() => { setDate(''); setTime('') }}>日付なし</button>
        </div>
        <button disabled={!text.trim()} className="min-h-12 w-full rounded-lg bg-moss font-bold text-white disabled:opacity-40"
          onClick={() => onSave({ text: text.trim(), scheduledDate: date || '', startTime: time || '' })}>
          {sub ? '保存（タスクマニアに反映）' : '追加（タスクマニアに反映）'}
        </button>
        <p className="text-[11px] text-stone-400">削除はタスクマニア本体から行ってください。</p>
      </div>
    </BottomSheet>
  )
}
