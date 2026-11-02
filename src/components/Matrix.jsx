import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { RANKS, rankOf } from '../lib/constants'
import BottomSheet from './BottomSheet'

const WEIGHT = { want: 3, nice: 1 }

// 比較マトリックス（土地・建物で共通）
// 行＝評価項目、列＝候補。1列目を固定して横スクロール。
export default function Matrix({ ctx, target, candidates, onOpenCandidate }) {
  const hid = ctx.household.id
  const me = ctx.me
  const partner = ctx.members.find((m) => m.user_id !== me.user_id)
  const [criteria, setCriteria] = useState([])
  const [scores, setScores] = useState({})
  const [mode, setMode] = useState('agreed') // me | partner | agreed
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

  const raterOf = (m) => (m === 'me' ? me.user_id : m === 'partner' ? partner?.user_id : 'agreed')
  const rater = raterOf(mode)
  const get = (cid, tid, r = rater) => scores[`${cid}|${tid}|${r}`]

  const save = async (c, tid, r, values) => {
    const key = `${c.id}|${tid}|${r}`
    const prev = scores[key] || {}
    const next = { ...prev, ...values }
    setScores((m) => ({ ...m, [key]: next }))
    const { error } = await supabase.from('scores').upsert(
      { household_id: hid, criteria_id: c.id, target_id: tid, rater: r, pass: next.pass ?? null, score: next.score ?? null, memo: next.memo ?? '', updated_at: new Date().toISOString() },
      { onConflict: 'criteria_id,target_id,rater' },
    )
    if (error) { alert(error.message); load() }
  }

  const sorted = useMemo(() => {
    const order = { must: 0, want: 1, nice: 2 }
    return [...criteria].sort((a, b) => order[a.rank] - order[b.rank] || a.sort - b.sort)
  }, [criteria])

  const summary = (tid) => {
    const failed = sorted.some((c) => c.rank === 'must' && get(c.id, tid)?.pass === false)
    let got = 0; let max = 0; let any = false
    sorted.forEach((c) => {
      if (c.rank === 'must') return
      max += WEIGHT[c.rank] * 5
      const v = get(c.id, tid)?.score
      if (v) { got += WEIGHT[c.rank] * v; any = true }
    })
    return { failed, total: any && max ? Math.round((got / max) * 100) : null }
  }

  const canEdit = rater === 'agreed' || rater === me.user_id

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-stone-200 bg-paper p-2 text-xs">
        {[['me', me.display_name], ['partner', partner?.display_name ?? 'パートナー'], ['agreed', 'ふたりの合意']].map(([m, l]) => (
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
                      <span className={`mt-1 block text-lg font-black ${s.failed ? '' : 'text-moss'}`}>{s.failed ? '✕' : s.total ?? '—'}</span>
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
                      const v = get(c.id, cand.id)
                      const failed = summary(cand.id).failed
                      const other = [me.user_id, partner?.user_id].filter(Boolean).map((u) => get(c.id, cand.id, u))
                      const differ = mode === 'agreed' && other.length === 2 && JSON.stringify([other[0]?.pass, other[0]?.score]) !== JSON.stringify([other[1]?.pass, other[1]?.score])
                      return (
                        <td key={cand.id} className={`border-b border-stone-100 p-0 text-center ${failed ? 'bg-stone-100' : 'bg-white'}`}>
                          <button className={`flex min-h-11 w-full items-center justify-center gap-0.5 ${differ ? 'bg-amber-50' : ''}`} onClick={() => setCell({ c, cand })}>
                            <CellValue c={c} v={v} />
                            {v?.memo && <span className="text-[9px] text-stone-400">✎</span>}
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
            点数＝Want（重み3）とNice（重み1）の合計を100点満点に換算。Mustに✕があると列がグレーになります。
            {mode === 'agreed' && partner && ' 黄色のセルは2人の評価がちがうところです。'}
          </p>
        </div>
      )}

      {cell && (
        <CellSheet
          ctx={ctx} partner={partner} c={cell.c} cand={cell.cand} rater={rater} canEdit={canEdit}
          get={get} onSave={(values) => save(cell.c, cell.cand.id, rater, values)} onClose={() => setCell(null)}
        />
      )}
      {manage && <CriteriaSheet ctx={ctx} target={target} criteria={criteria} reload={load} onClose={() => setManage(false)} />}
    </div>
  )
}

function CellValue({ c, v }) {
  if (c.rank === 'must') {
    if (v?.pass === true) return <span className="text-base font-bold text-moss">〇</span>
    if (v?.pass === false) return <span className="text-base font-bold text-rose-600">✕</span>
    return <span className="text-stone-300">—</span>
  }
  return v?.score ? <span className="text-base font-bold">{v.score}</span> : <span className="text-stone-300">—</span>
}

function CellSheet({ ctx, partner, c, cand, rater, canEdit, get, onSave, onClose }) {
  const v = get(c.id, cand.id) || {}
  const [memo, setMemo] = useState(v.memo || '')
  const close = () => { if (canEdit && memo !== (v.memo || '')) onSave({ memo }); onClose() }
  const label = rater === 'agreed' ? 'ふたりの合意' : `${ctx.me.display_name}の評価`
  const show = (x) => (c.rank === 'must' ? (x?.pass === true ? '〇' : x?.pass === false ? '✕' : '—') : x?.score ?? '—')

  return (
    <BottomSheet open title={`${cand.name}｜${c.name}`} onClose={close}>
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap gap-3 text-xs text-stone-600">
          <span>{ctx.me.display_name}：<b>{show(get(c.id, cand.id, ctx.me.user_id))}</b></span>
          {partner && <span>{partner.display_name}：<b>{show(get(c.id, cand.id, partner.user_id))}</b></span>}
          <span>合意：<b>{show(get(c.id, cand.id, 'agreed'))}</b></span>
        </div>
        {canEdit ? (
          <>
            <p className="font-bold">{label}</p>
            {c.rank === 'must' ? (
              <div className="grid grid-cols-3 gap-2">
                {[[true, '〇 満たす'], [false, '✕ 満たさない'], [null, 'クリア']].map(([val, l]) => (
                  <button key={l} className={`min-h-12 rounded-xl border-2 ${v.pass === val ? 'border-moss bg-moss text-white' : 'border-stone-200'}`} onClick={() => onSave({ pass: val })}>{l}</button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-6 gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} className={`min-h-12 rounded-xl border-2 text-lg font-bold ${v.score === n ? 'border-moss bg-moss text-white' : 'border-stone-200'}`} onClick={() => onSave({ score: n })}>{n}</button>
                ))}
                <button className="min-h-12 rounded-xl border-2 border-stone-200 text-xs" onClick={() => onSave({ score: null })}>クリア</button>
              </div>
            )}
            <textarea className="min-h-20 w-full rounded-lg border border-stone-300 px-3 py-2" placeholder="メモ（理由・気づいたこと）" value={memo} onChange={(e) => setMemo(e.target.value)} />
          </>
        ) : (
          <p className="text-xs text-stone-500">パートナーの評価は見るだけです。{v.memo && <><br />メモ：{v.memo}</>}</p>
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
