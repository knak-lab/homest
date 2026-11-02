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

// 比較マトリックス（土地・建物で共通）
// 行＝評価項目、列＝候補。1列目を固定して横スクロール。
export default function Matrix({ ctx, target, candidates, onOpenCandidate }) {
  const hid = ctx.household.id
  const me = ctx.me
  const partner = ctx.members.find((m) => m.user_id !== me.user_id)
  const [criteria, setCriteria] = useState([])
  const [scores, setScores] = useState({})
  const [mode, setMode] = useState('common') // me | partner | common
  const [cell, setCell] = useState(null) // { c, cand }
  const [manage, setManage] = useState(false)

  const load = useCallback(async () => {
    const [c, s] = await Promise.all([
      supabase.from('criteria').select('*').eq('household_id', hid).eq('target', target).order('sort').order('created_at'),
      supabase.from('scores').select('*').eq('household_id', hid),
    ])
    if (c.error) return alert(c.error.message)
    setCriteria(c.data)
    const map = {}
    s.data?.forEach((x) => { map[`${x.criteria_id}|${x.target_id}|${x.rater}`] = x })
    setScores(map)
  }, [hid, target])

  useEffect(() => { load() }, [load])

  const raw = (cid, tid, r) => scores[`${cid}|${tid}|${r}`]
  const people = [me.user_id, partner?.user_id].filter(Boolean)

  // セルの点（0〜2）。共通＝手で上書きした値があればそれ、なければ2人の平均
  const cellPts = (cid, tid, m = mode) => {
    if (m === 'me') return ptsOf(raw(cid, tid, me.user_id)?.score)
    if (m === 'partner') return partner ? ptsOf(raw(cid, tid, partner.user_id)?.score) : null
    const over = ptsOf(raw(cid, tid, 'agreed')?.score)
    if (over != null) return over
    const vals = people.map((u) => ptsOf(raw(cid, tid, u)?.score)).filter((v) => v != null)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }
  const isOverride = (cid, tid) => raw(cid, tid, 'agreed')?.score != null
  const differ = (cid, tid) => {
    if (people.length < 2) return false
    const [a, b] = people.map((u) => raw(cid, tid, u)?.score)
    return a != null && b != null && a !== b
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
    return [...criteria].sort((a, b) => order[a.rank] - order[b.rank] || a.sort - b.sort)
  }, [criteria])

  // 総合点：評価済みの項目だけで、Σ(重み×点) ÷ Σ(重み×2) × 100
  const summary = (tid) => {
    let got = 0; let max = 0; let done = 0; let failed = false
    sorted.forEach((c) => {
      const v = cellPts(c.id, tid)
      if (v == null) return
      done++
      got += WEIGHT[c.rank] * v; max += WEIGHT[c.rank] * 2
      if (c.rank === 'must' && v < 0.75) failed = true
    })
    return { failed, total: max ? Math.round((got / max) * 100) : null, done }
  }

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
          評価項目がまだありません。<br />右上の「項目」から、優先順位を付けた要望を<br />比較の項目として追加できます。
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
              {sorted.map((c) => {
                const r = rankOf(c.rank)
                return (
                  <tr key={c.id}>
                    <td className="sticky left-0 z-10 border-b border-stone-100 bg-white p-2">
                      <span className={`mr-1 rounded px-1 py-0.5 text-[9px] font-bold ${r.cls}`}>{r.label}</span>
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
  const [wishes, setWishes] = useState([])
  const [ratings, setRatings] = useState({})
  const [name, setName] = useState('')
  const [rank, setRank] = useState('want')

  useEffect(() => {
    (async () => {
      const [w, r] = await Promise.all([
        supabase.from('wishes').select('id,title,parent_id,in_priority').eq('household_id', hid).eq('in_priority', true),
        supabase.from('ratings').select('*').eq('household_id', hid).eq('target_type', 'wish'),
      ])
      setWishes(w.data || [])
      const m = {}; r.data?.forEach((x) => { m[`${x.target_id}|${x.rater}`] = x.rank }); setRatings(m)
    })()
  }, [hid])

  const used = new Set(criteria.map((c) => c.wish_id).filter(Boolean))
  const rankFor = (wid) => ratings[`${wid}|agreed`] || ratings[`${wid}|${ctx.me.user_id}`] || 'want'

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
  const addAllAgreed = async () => {
    const list = wishes.filter((w) => !used.has(w.id) && ratings[`${w.id}|agreed`])
    if (!list.length) return alert('追加できる「合意済み」の要望はありません')
    const { error } = await supabase.from('criteria').insert(list.map((w, i) => ({ household_id: hid, target, name: w.title, wish_id: w.id, rank: ratings[`${w.id}|agreed`], sort: criteria.length + i })))
    if (error) return alert(error.message)
    reload()
  }

  return (
    <BottomSheet open title="評価項目" onClose={onClose}>
      <div className="space-y-5 text-sm">
        <section>
          <p className="mb-2 font-bold">今の項目（{criteria.length}）</p>
          {criteria.length === 0 && <p className="text-xs text-stone-400">まだありません</p>}
          <ul className="space-y-1.5">
            {criteria.map((c) => (
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
          <div className="mb-2 flex items-center justify-between">
            <p className="font-bold">要望から追加</p>
            <button className="rounded-lg border border-moss px-2 py-1 text-xs text-moss" onClick={addAllAgreed}>合意済みをまとめて追加</button>
          </div>
          {wishes.filter((w) => !used.has(w.id)).length === 0 && <p className="text-xs text-stone-400">追加できる要望はありません（暮らしタブで「⭐優先順位に載せる」をオンにした要望が出てきます）</p>}
          <ul className="space-y-1.5">
            {wishes.filter((w) => !used.has(w.id)).map((w) => {
              const r = rankOf(rankFor(w.id))
              return (
                <li key={w.id}>
                  <button className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-stone-200 px-2 text-left" onClick={() => add({ name: w.title, wish_id: w.id, rank: rankFor(w.id) })}>
                    <span className={`rounded px-1 py-0.5 text-[9px] font-bold ${r.cls}`}>{r.label}</span>
                    <span className="min-w-0 flex-1 truncate">{w.title}</span>
                    <span className="text-moss">＋</span>
                  </button>
                </li>
              )
            })}
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
