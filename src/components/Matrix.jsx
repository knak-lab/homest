import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { RANKS, rankOf } from '../lib/constants'
import BottomSheet from './BottomSheet'

const WEIGHT = { must: 5, want: 3, nice: 1 }
// 〇△✕は scores.score に保存：3=〇（2点）、2=△（1点）、1=✕（0点）
const MARKS = [
  { score: 3, label: '〇', pts: 2, cls: 'text-moss' },
  { score: 2, label: '△', pts: 1, cls: 'text-amber-600' },
  { score: 1, label: '✕', pts: 0, cls: 'text-rose-600' },
]
const markOf = (score) => MARKS.find((m) => m.score === score)
const ptsOf = (score) => markOf(score)?.pts ?? null
const labelOfPts = (p) => (p == null ? '—' : p >= 1.75 ? '〇' : p >= 0.75 ? '△' : '✕')

// 評価データの読み書きと計算（比較表・物件ごとの評価シートで共通）
export function useEval(ctx, target) {
  const hid = ctx.household.id
  const me = ctx.me
  const partner = ctx.members.find((m) => m.user_id !== me.user_id)
  const [criteria, setCriteria] = useState([])
  const [scores, setScores] = useState({})

  // 優先順位を付けた要望（合意 → 自分 → パートナーの順で採用）を、評価項目として自動で用意する
  const load = useCallback(async () => {
    const [c, s, w, r] = await Promise.all([
      supabase.from('criteria').select('*').eq('household_id', hid).eq('target', target).order('sort').order('created_at'),
      supabase.from('scores').select('*').eq('household_id', hid),
      supabase.from('wishes').select('id,title').eq('household_id', hid).eq('in_priority', true),
      supabase.from('ratings').select('target_id,rater,rank').eq('household_id', hid).eq('target_type', 'wish'),
    ])
    if (c.error) return alert(c.error.message)
    const rk = {}; r.data?.forEach((x) => { rk[`${x.target_id}|${x.rater}`] = x.rank })
    const rankFor = (wid) => rk[`${wid}|agreed`] || rk[`${wid}|${me.user_id}`] || (partner ? rk[`${wid}|${partner.user_id}`] : null) || null
    let rows = c.data
    const byWish = {}
    rows.forEach((x) => { if (x.wish_id && !byWish[x.wish_id]) byWish[x.wish_id] = x })
    const inserts = []; const updates = []
    ;(w.data || []).forEach((wish, i) => {
      const rank = rankFor(wish.id)
      if (!rank) return
      const ex = byWish[wish.id]
      if (!ex) inserts.push({ household_id: hid, target, name: wish.title, wish_id: wish.id, rank, sort: 1000 + i })
      else if (ex.rank !== rank || ex.name !== wish.title) updates.push({ id: ex.id, rank, name: wish.title })
    })
    if (inserts.length) {
      const { data } = await supabase.from('criteria').insert(inserts).select()
      rows = [...rows, ...(data || [])]
    }
    for (const u of updates) {
      await supabase.from('criteria').update({ rank: u.rank, name: u.name }).eq('id', u.id)
      rows = rows.map((x) => (x.id === u.id ? { ...x, rank: u.rank, name: u.name } : x))
    }
    // 優先順位から外した要望や、未分類に戻した要望の項目は表示しない（点数は残す）
    const active = new Set((w.data || []).filter((wish) => rankFor(wish.id)).map((wish) => wish.id))
    const seen = new Set()
    rows = rows.filter((x) => {
      if (!x.wish_id) return true
      if (!active.has(x.wish_id) || seen.has(x.wish_id)) return false
      seen.add(x.wish_id); return true
    })
    setCriteria(rows)
    const map = {}
    s.data?.forEach((x) => { map[`${x.criteria_id}|${x.target_id}|${x.rater}`] = x })
    setScores(map)
  }, [hid, target, me.user_id, partner?.user_id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const raw = (cid, tid, r) => scores[`${cid}|${tid}|${r}`]
  const people = [me.user_id, partner?.user_id].filter(Boolean)

  // セルの点（0〜2）。共通＝手で上書きした値があればそれ、なければ2人の平均
  const cellPts = (cid, tid, m) => {
    if (m === 'me') return ptsOf(raw(cid, tid, me.user_id)?.score)
    if (m === 'partner') return partner ? ptsOf(raw(cid, tid, partner.user_id)?.score) : null
    const over = ptsOf(raw(cid, tid, 'agreed')?.score)
    if (over != null) return over
    const vals = people.map((u) => ptsOf(raw(cid, tid, u)?.score)).filter((v) => v != null)
    return vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null
  }
  const isOverride = (cid, tid) => raw(cid, tid, 'agreed')?.score != null
  const differ = (cid, tid) => {
    if (people.length < 2) return false
    const [x, y] = people.map((u) => raw(cid, tid, u)?.score)
    return x != null && y != null && x !== y
  }

  const save = async (c, tid, r, values) => {
    const key = `${c.id}|${tid}|${r}`
    const next = { ...(scores[key] || {}), ...values }
    setScores((m) => ({ ...m, [key]: next }))
    const { error } = await supabase.from('scores').upsert(
      { household_id: hid, criteria_id: c.id, target_id: tid, rater: r, pass: null, score: next.score ?? null, memo: next.memo ?? '', updated_at: new Date().toISOString() },
      { onConflict: 'criteria_id,target_id,rater' },
    )
    if (error) { alert(error.message); load() }
  }

  const sorted = useMemo(() => {
    const order = { must: 0, want: 1, nice: 2 }
    return [...criteria].sort((x, y) => order[x.rank] - order[y.rank] || x.sort - y.sort)
  }, [criteria])

  // 総合点：評価済みの項目だけで、Σ(重み×点) ÷ Σ(重み×2) × 100
  const summary = (tid, m) => {
    let got = 0; let max = 0; let done = 0; let failed = false
    sorted.forEach((c) => {
      const v = cellPts(c.id, tid, m)
      if (v == null) return
      done++
      got += WEIGHT[c.rank] * v; max += WEIGHT[c.rank] * 2
      if (c.rank === 'must' && v < 0.75) failed = true
    })
    return { failed, total: max ? Math.round((got / max) * 100) : null, done }
  }

  return { me, partner, criteria, sorted, raw, cellPts, isOverride, differ, save, summary, load }
}

// 比較マトリックス（土地・建物で共通）
// 行＝評価項目、列＝候補。1列目を固定して横スクロール。
export default function Matrix({ ctx, target, candidates, onOpenCandidate }) {
  const ev = useEval(ctx, target)
  const { me, partner, criteria, sorted, raw, isOverride, differ, load } = ev
  const [mode, setMode] = useState('common') // me | partner | common
  const [cell, setCell] = useState(null) // { c, cand }
  const [manage, setManage] = useState(false)
  const [open, setOpen] = useState({ want: false, nice: false })
  const cellPts = (cid, tid, m = mode) => ev.cellPts(cid, tid, m)
  const summary = (tid) => ev.summary(tid, mode)
  const save = ev.save

  const editRater = mode === 'me' ? me.user_id : mode === 'common' ? 'agreed' : null

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-stone-200 bg-paper p-2 text-xs">
        {[['me', me.display_name], ['partner', partner?.display_name ?? 'パートナー'], ['common', '共通']].map(([m, l]) => (
          <button key={m} disabled={m === 'partner' && !partner} className={`min-h-10 flex-1 truncate rounded-lg px-1 disabled:opacity-40 ${mode === m ? 'bg-moss font-bold text-white' : 'bg-white'}`} onClick={() => setMode(m)}>{l}</button>
        ))}
        <button className="min-h-10 rounded-lg bg-stone-800 px-3 text-white" onClick={() => setManage(true)}>項目</button>
      </div>

      {criteria.length === 0 ? (
        <div className="p-6 text-center text-sm leading-relaxed text-stone-500">
          評価項目がまだありません。<br />優先順位タブで要望に Must／Want／Nice を付けると、<br />ここに自動で並びます。
        </div>
      ) : candidates.length === 0 ? (
        <p className="p-6 text-center text-sm text-stone-500">比べる候補がまだありません。</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th className="sticky top-0 left-0 z-20 min-w-32 border-b border-stone-200 bg-paper p-2 text-left">評価項目</th>
                {candidates.map((cand) => {
                  const s = summary(cand.id)
                  return (
                    <th key={cand.id} className={`sticky top-0 z-10 min-w-24 max-w-28 border-b border-stone-200 p-2 align-bottom ${s.failed ? 'bg-stone-200 text-stone-400' : 'bg-paper'}`}>
                      <button className="block w-full text-center underline decoration-stone-300" onClick={() => onOpenCandidate?.(cand.id)}>
                        <span className="line-clamp-2 break-all">{cand.name}</span>
                      </button>
                      <span className={`mt-1 block text-lg font-black ${s.failed ? '' : 'text-moss'}`}>{s.total ?? '—'}</span>
                      <span className="block text-[9px] font-normal text-stone-400">{s.failed ? 'Mustに✕' : `${s.done}/${sorted.length}項目`}</span>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {['must', 'want', 'nice'].map((gid) => {
                const list = sorted.filter((c) => c.rank === gid)
                if (!list.length) return null
                const isOpen = gid === 'must' || open[gid]
                return [
                  <tr key={`h-${gid}`}>
                    <td colSpan={candidates.length + 1} className="sticky left-0 border-b border-stone-200 bg-stone-50 p-0">
                      <button disabled={gid === 'must'} className="sticky left-0 flex min-h-9 items-center gap-2 px-2 text-left" onClick={() => setOpen((o) => ({ ...o, [gid]: !o[gid] }))}>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${rankOf(gid).cls}`}>{rankOf(gid).label}</span>
                        <span className="text-[11px] text-stone-500">{list.length}項目{gid !== 'must' && (isOpen ? '　▾ 閉じる' : '　▸ 開く')}</span>
                      </button>
                    </td>
                  </tr>,
                  ...(isOpen ? list.map((c) => {
                return (
                  <tr key={c.id}>
                    <td className="sticky left-0 z-10 border-b border-stone-100 bg-white p-2">
                      <span className="break-all">{c.name}</span>
                    </td>
                    {candidates.map((cand) => {
                      const v = cellPts(c.id, cand.id)
                      const warn = mode === 'common' && differ(c.id, cand.id) && !isOverride(c.id, cand.id)
                      const lbl = labelOfPts(v)
                      const color = lbl === '〇' ? 'text-moss' : lbl === '△' ? 'text-amber-600' : lbl === '✕' ? 'text-rose-600' : 'text-stone-300'
                      const memo = raw(c.id, cand.id, editRater ?? partner?.user_id)?.memo
                      return (
                        <td key={cand.id} className={`border-b border-stone-100 p-0 text-center ${summary(cand.id).failed ? 'bg-stone-100' : 'bg-white'}`}>
                          <button className={`flex min-h-11 w-full flex-col items-center justify-center ${warn ? 'bg-amber-50' : ''}`} onClick={() => setCell({ c, cand })}>
                            <span className={`text-base font-bold ${color}`}>{lbl}{memo ? <sup className="text-[9px] text-stone-400">✎</sup> : null}</span>
                            {mode === 'common' && v != null && (
                              <span className="text-[9px] text-stone-400">{isOverride(c.id, cand.id) ? '手動' : Number.isInteger(v) ? '' : v.toFixed(1)}</span>
                            )}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                )
              }) : []),
                ]
              })}
            </tbody>
          </table>
          <p className="p-3 text-[11px] leading-relaxed text-stone-400">
            〇＝2点・△＝1点・✕＝0点。重みはMust 5／Want 3／Nice 1で、評価済みの項目を100点満点に換算します。Mustに✕があると列がグレーになります。
            {mode === 'common' && ' 共通は2人の平均（タップで手動の上書きも可）。黄色は2人の評価がちがうところです。'}
          </p>
        </div>
      )}

      {cell && (
        <CellSheet
          ctx={ctx} partner={partner} c={cell.c} cand={cell.cand} mode={mode} editRater={editRater}
          raw={raw} cellPts={cellPts} onSave={(values) => save(cell.c, cell.cand.id, editRater, values)} onClose={() => setCell(null)}
        />
      )}
      {manage && <CriteriaSheet ctx={ctx} target={target} criteria={criteria} reload={load} onClose={() => setManage(false)} />}
    </div>
  )
}

function CellSheet({ ctx, partner, c, cand, mode, editRater, raw, cellPts, onSave, onClose }) {
  const mine = editRater ? raw(c.id, cand.id, editRater) || {} : {}
  const [memo, setMemo] = useState(mine.memo || '')
  const close = () => { if (editRater && memo !== (mine.memo || '')) onSave({ memo }); onClose() }
  const show = (u) => markOf(raw(c.id, cand.id, u)?.score)?.label ?? '—'
  const common = cellPts(c.id, cand.id, 'common')

  return (
    <BottomSheet open title={`${cand.name}｜${c.name}`} onClose={close}>
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap gap-4 rounded-lg bg-stone-50 p-3 text-xs text-stone-600">
          <span>{ctx.me.display_name}：<b className="text-base">{show(ctx.me.user_id)}</b></span>
          {partner && <span>{partner.display_name}：<b className="text-base">{show(partner.user_id)}</b></span>}
          <span>共通：<b className="text-base">{labelOfPts(common)}</b>{common != null && !Number.isInteger(common) ? `（${common.toFixed(1)}点）` : ''}</span>
        </div>

        {editRater ? (
          <>
            <p className="font-bold">{mode === 'common' ? '共通を手動で決める（空なら2人の平均）' : `${ctx.me.display_name}の評価`}</p>
            <div className="grid grid-cols-3 gap-2">
              {MARKS.map((m) => (
                <button key={m.score}
                  className={`min-h-14 rounded-xl border-2 text-2xl font-bold ${mine.score === m.score ? 'border-moss bg-moss text-white' : `border-stone-200 ${m.cls}`}`}
                  onClick={() => onSave({ score: mine.score === m.score ? null : m.score })}>
                  {m.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-stone-400">
              {mode === 'common' ? '同じものをもう一度押すと手動の上書きを解除し、2人の平均に戻ります。' : '同じものをもう一度押すと未評価に戻ります。'}
            </p>
            <textarea className="min-h-20 w-full rounded-lg border border-stone-300 px-3 py-2" placeholder="メモ（理由・気づいたこと）" value={memo} onChange={(e) => setMemo(e.target.value)} />
          </>
        ) : (
          <p className="text-xs text-stone-500">
            パートナーの評価は見るだけです。
            {partner && raw(c.id, cand.id, partner.user_id)?.memo && <><br />メモ：{raw(c.id, cand.id, partner.user_id).memo}</>}
          </p>
        )}
      </div>
    </BottomSheet>
  )
}

// 評価項目の管理：要望（優先順位）から追加／手動追加／削除
function CriteriaSheet({ ctx, target, criteria, reload, onClose }) {
  const hid = ctx.household.id
  const [name, setName] = useState('')
  const [rank, setRank] = useState('want')

  const add = async (values) => {
    const { error } = await supabase.from('criteria').insert({ household_id: hid, target, sort: criteria.length, ...values })
    if (error) return alert(error.message)
    reload()
  }
  const update = async (c, values) => { await supabase.from('criteria').update(values).eq('id', c.id); reload() }
  const remove = async (c) => {
    if (!confirm(`「${c.name}」を評価項目から外しますか？（付けた点数も消えます）`)) return
    await supabase.from('criteria').delete().eq('id', c.id); reload()
  }
  return (
    <BottomSheet open title="要望以外の項目" onClose={onClose}>
      <div className="space-y-5 text-sm">
        <section>
          <p className="mb-1 font-bold">要望以外の項目（{criteria.filter((c) => !c.wish_id).length}）</p>
          <p className="mb-2 text-[11px] text-stone-400">優先順位を付けた要望は自動で並びます。ここでは「駅までの距離」など、要望にない項目だけを追加できます。</p>
          <ul className="space-y-1.5">
            {criteria.filter((c) => !c.wish_id).map((c) => (
              <li key={c.id} className="flex items-center gap-2 rounded-lg bg-stone-50 px-2 py-1.5">
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <select className="rounded border border-stone-300 bg-white px-1 py-1 text-xs" value={c.rank} onChange={(e) => update(c, { rank: e.target.value })}>
                  {RANKS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
                <button className="px-2 text-stone-400" onClick={() => remove(c)}>✕</button>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <p className="mb-2 font-bold">自分で追加</p>
          <div className="flex gap-2">
            <input className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2" placeholder="例：駅までの距離" value={name} onChange={(e) => setName(e.target.value)} />
            <select className="rounded-lg border border-stone-300 bg-white px-2" value={rank} onChange={(e) => setRank(e.target.value)}>
              {RANKS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            <button className="rounded-lg bg-moss px-3 text-white" onClick={() => { if (name.trim()) { add({ name: name.trim(), rank }); setName('') } }}>追加</button>
          </div>
        </section>
      </div>
    </BottomSheet>
  )
}

// 物件ごとの評価シート：行＝評価項目、列＝自分／パートナー／共通
const GROUPS = [{ id: 'must' }, { id: 'want' }, { id: 'nice' }]
const CYCLE = [null, 3, 2, 1]
const nextMark = (score) => CYCLE[(CYCLE.indexOf(score ?? null) + 1) % CYCLE.length]

export function EvalSheet({ ctx, target, candidate, onClose }) {
  const ev = useEval(ctx, target)
  const { me, partner, sorted, criteria, raw, cellPts, isOverride, differ, save, summary, load } = ev
  const [manage, setManage] = useState(false)
  const [memoFor, setMemoFor] = useState(null)
  const [open, setOpen] = useState({ want: false, nice: false })
  const tid = candidate.id

  const cols = [
    { key: 'me', label: me.display_name, edit: true },
    { key: 'partner', label: partner?.display_name ?? 'パートナー', edit: false },
    { key: 'common', label: '共通', edit: true },
  ]
  const tap = (c, col) => {
    if (!col.edit) return
    const r = col.key === 'me' ? me.user_id : 'agreed'
    save(c, tid, r, { score: nextMark(raw(c.id, tid, r)?.score) })
  }

  return (
    <BottomSheet open title={`評価｜${candidate.name}`} onClose={onClose}>
      <div className="space-y-3 text-sm">
        {criteria.length === 0 ? (
          <p className="rounded-lg bg-stone-50 p-4 text-center text-xs leading-relaxed text-stone-500">
            評価項目がまだありません。<br />優先順位タブで要望に Must／Want／Nice を付けると、ここに自動で並びます。
          </p>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_repeat(3,3.75rem)] items-end gap-1 text-center">
              <span />
              {cols.map((col) => {
                const s = summary(tid, col.key)
                return (
                  <div key={col.key} className={`rounded-lg py-1 ${col.key === 'common' ? 'bg-moss/10' : ''}`}>
                    <p className="truncate text-[10px] text-stone-500">{col.label}</p>
                    <p className={`text-xl font-black ${s.failed ? 'text-stone-400' : 'text-moss'}`}>{s.total ?? '—'}</p>
                    <p className="text-[9px] text-stone-400">{s.failed ? 'Mustに✕' : `${s.done}/${sorted.length}`}</p>
                  </div>
                )
              })}
            </div>

            {GROUPS.map((g) => {
              const list = sorted.filter((c) => c.rank === g.id)
              if (!list.length) return null
              const isOpen = g.id === 'must' || open[g.id]
              const done = list.filter((c) => raw(c.id, tid, me.user_id)?.score != null).length
              return (
                <section key={g.id}>
                  <button disabled={g.id === 'must'} className="mb-1 flex min-h-9 w-full items-center gap-2 text-left" onClick={() => setOpen((o) => ({ ...o, [g.id]: !o[g.id] }))}>
                    <span className={`rounded px-2 py-0.5 text-xs font-bold ${rankOf(g.id).cls}`}>{rankOf(g.id).label}</span>
                    <span className="text-xs text-stone-500">{list.length}項目・自分の評価 {done}/{list.length}</span>
                    {g.id !== 'must' && <span className="ml-auto text-xs text-stone-500">{isOpen ? '▾ 閉じる' : '▸ 開く'}</span>}
                  </button>
                  {isOpen && (
                    <div className="divide-y divide-stone-100 rounded-xl border border-stone-200">
                      {list.map((c) => {
                const warn = differ(c.id, tid) && !isOverride(c.id, tid)
                const myMemo = raw(c.id, tid, me.user_id)?.memo || ''
                return (
                  <div key={c.id} className={warn ? 'bg-amber-50' : ''}>
                    <div className="grid grid-cols-[1fr_repeat(3,3.75rem)] items-center gap-1 px-2">
                      <button className="min-w-0 py-2 text-left" onClick={() => setMemoFor(memoFor === c.id ? null : c.id)}>
                        <span className="break-all">{c.name}</span>
                        {myMemo && <span className="ml-1 text-[10px] text-stone-400">✎</span>}
                      </button>
                      {cols.map((col) => {
                        const v = cellPts(c.id, tid, col.key)
                        const lbl = labelOfPts(v)
                        const color = lbl === '〇' ? 'text-moss' : lbl === '△' ? 'text-amber-600' : lbl === '✕' ? 'text-rose-600' : 'text-stone-300'
                        return (
                          <button key={col.key} disabled={!col.edit}
                            className={`flex min-h-12 flex-col items-center justify-center rounded-lg ${col.edit ? 'border border-stone-200 bg-white active:bg-stone-100' : ''} ${col.key === 'common' ? 'bg-moss/5' : ''}`}
                            onClick={() => tap(c, col)}>
                            <span className={`text-xl font-bold leading-none ${color}`}>{lbl}</span>
                            {col.key === 'common' && v != null && (
                              <span className="text-[9px] text-stone-400">{isOverride(c.id, tid) ? '手動' : [me.user_id, partner?.user_id].filter((u) => u && raw(c.id, tid, u)?.score != null).length < 2 ? '1人分' : Number.isInteger(v) ? '平均' : v.toFixed(1)}</span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                    {memoFor === c.id && (
                      <MemoRow
                        initial={myMemo}
                        partnerMemo={partner ? raw(c.id, tid, partner.user_id)?.memo : ''}
                        partnerName={partner?.display_name}
                        onSave={(memo) => save(c, tid, me.user_id, { memo })}
                      />
                    )}
                  </div>
                )
              })}
                    </div>
                  )}
                </section>
              )
            })}
            <p className="text-[11px] leading-relaxed text-stone-400">
              マスをタップするたびに 〇 → △ → ✕ → 未評価 と切り替わります。共通は2人の平均で、タップすると手動で上書きできます（未評価に戻すと平均に戻ります）。項目名をタップするとメモを書けます。黄色は2人の評価がちがう項目です。
            </p>
          </>
        )}
        <button className="min-h-11 w-full rounded-lg border border-stone-300 text-xs text-stone-600" onClick={() => setManage(true)}>要望以外の項目を追加（任意）</button>
      </div>
      {manage && <CriteriaSheet ctx={ctx} target={target} criteria={criteria} reload={load} onClose={() => setManage(false)} />}
    </BottomSheet>
  )
}

function MemoRow({ initial, partnerMemo, partnerName, onSave }) {
  const [memo, setMemo] = useState(initial)
  return (
    <div className="space-y-1 px-2 pb-2">
      <textarea className="min-h-16 w-full rounded-lg border border-stone-300 px-2 py-1 text-xs" placeholder="自分のメモ（理由・気づいたこと）" value={memo}
        onChange={(e) => setMemo(e.target.value)} onBlur={() => memo !== initial && onSave(memo)} />
      {partnerMemo && <p className="text-[11px] text-stone-500">{partnerName}のメモ：{partnerMemo}</p>}
    </div>
  )
}
