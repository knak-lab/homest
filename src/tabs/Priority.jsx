import { useCallback, useEffect, useMemo, useState } from 'react'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../lib/supabase'
import { RANKS, rankOf } from '../lib/constants'
import BottomSheet from '../components/BottomSheet'
import Attachments from '../components/Attachments'

export default function Priority({ ctx }) {
  const hid = ctx.household.id
  const me = ctx.me
  const partner = ctx.members.find((m) => m.user_id !== me.user_id)
  const [wishes, setWishes] = useState([])
  const [ratings, setRatings] = useState({})
  const [sorts, setSorts] = useState({})
  const [mode, setMode] = useState('me') // me | partner | agreed | compare
  const [openId, setOpenId] = useState(null)

  const load = useCallback(async () => {
    const [w, r] = await Promise.all([
      supabase.from('wishes').select('*').eq('household_id', hid),
      supabase.from('ratings').select('*').eq('household_id', hid).eq('target_type', 'wish'),
    ])
    if (w.error) return alert(w.error.message)
    setWishes(w.data)
    const map = {}; const so = {}
    r.data?.forEach((x) => { map[`${x.target_id}|${x.rater}`] = x.rank; so[`${x.target_id}|${x.rater}`] = x.sort ?? 0 })
    setRatings(map); setSorts(so)
  }, [hid])

  useEffect(() => {
    load()
    const onVis = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [load])

  const byId = useMemo(() => Object.fromEntries(wishes.map((w) => [w.id, w])), [wishes])
  const items = useMemo(() => wishes.filter((w) => w.in_priority && w.parent_id), [wishes])
  const rank = (id, rater) => ratings[`${id}|${rater}`] ?? null

  const raterOf = (m) => (m === 'me' ? me.user_id : m === 'partner' ? partner?.user_id : 'agreed')

  const sortOf = (id, rater) => sorts[`${id}|${rater}`] ?? 0
  // そのレーンの並び順（並び替えた順 → 同じなら名前順）
  const laneOf = (rk, rater) => items.filter((w) => rank(w.id, rater) === rk)
    .sort((a, b) => sortOf(a.id, rater) - sortOf(b.id, rater) || a.title.localeCompare(b.title, 'ja'))

  const setRank = async (wishId, rater, value) => {
    // 新しく入ったレーンでは一番下に置く
    const nextSort = value ? Math.max(-1, ...laneOf(value, rater).filter((w) => w.id !== wishId).map((w) => sortOf(w.id, rater))) + 1 : 0
    setRatings((r) => ({ ...r, [`${wishId}|${rater}`]: value }))
    setSorts((s) => ({ ...s, [`${wishId}|${rater}`]: nextSort }))
    const row = { household_id: hid, target_type: 'wish', target_id: wishId, rater, rank: value, sort: nextSort, updated_at: new Date().toISOString() }
    let { error } = await supabase.from('ratings').upsert(row, { onConflict: 'target_type,target_id,rater' })
    if (error && isNoSortColumn(error)) {
      // 並び替え用の列がまだない（SQL 0005 未実行）ときは、順番なしで保存する
      const { sort: _s, ...rest } = row
      ;({ error } = await supabase.from('ratings').upsert(rest, { onConflict: 'target_type,target_id,rater' }))
    }
    if (error) { alert(error.message); load() }
  }

  // ドラッグで並べ替えたレーンを 0,1,2… に振り直して保存
  const reorderLane = async (rk, rater, ordered) => {
    setSorts((so) => { const n = { ...so }; ordered.forEach((w, k) => { n[`${w.id}|${rater}`] = k }); return n })
    const now = new Date().toISOString()
    const { error } = await supabase.from('ratings').upsert(
      ordered.map((w, k) => ({ household_id: hid, target_type: 'wish', target_id: w.id, rater, rank: rk, sort: k, updated_at: now })),
      { onConflict: 'target_type,target_id,rater' },
    )
    if (error) {
      alert(isNoSortColumn(error) ? '並び替えを保存するには、SupabaseでSQL「0005_priority_sort.sql」を実行してください。' : error.message)
      load()
    }
  }
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const mismatch = (id) => {
    if (!partner) return false
    const a = rank(id, me.user_id); const b = rank(id, partner.user_id)
    return a !== b
  }

  const agreeAllMatched = async () => {
    const targets = items.filter((w) => {
      const a = rank(w.id, me.user_id)
      return a && partner && a === rank(w.id, partner.user_id) && !rank(w.id, 'agreed')
    })
    if (!targets.length) return alert('まとめて合意にできるもの（2人の評価が一致していて、まだ合意がないもの）はありません')
    if (!confirm(`${targets.length} 件を、2人の評価どおりに合意にします`)) return
    for (const w of targets) await setRank(w.id, 'agreed', rank(w.id, me.user_id))
  }

  const segments = [
    ['me', me.display_name],
    ['partner', partner?.display_name ?? 'パートナー'],
    ['agreed', 'ふたりの合意'],
    ['compare', '比べる'],
  ]

  const parentTitle = (w) => byId[w.parent_id]?.title

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="grid grid-cols-4 gap-1 border-b border-stone-200 bg-paper p-2 text-xs">
        {segments.map(([m, l]) => (
          <button key={m} className={`min-h-10 truncate rounded-lg px-1 ${mode === m ? 'bg-moss font-bold text-white' : 'bg-white'}`} onClick={() => setMode(m)}>{l}</button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-8">
        {items.length === 0 && (
          <p className="mt-10 text-center text-sm leading-relaxed text-stone-500">
            まだ項目がありません。<br />「暮らし」タブでノードを編集し、<br />「⭐ 優先順位に載せる」をオンにしてください。
          </p>
        )}

        {mode === 'partner' && !partner && items.length > 0 && (
          <p className="mb-3 rounded-lg bg-amber-50 p-3 text-xs">パートナーはまだ参加していません。設定から招待リンクを送れます。</p>
        )}
        {mode === 'partner' && partner && items.length > 0 && (
          <p className="mb-3 text-xs text-stone-500">{partner.display_name}さんの評価です（見るだけ）</p>
        )}

        {mode !== 'compare' && items.length > 0 && (mode !== 'partner' || partner) && (
          <div className="space-y-4">
            {(mode === 'me' || mode === 'agreed') && (
              <p className="text-right text-[11px] text-stone-400">右の ≡ をつかんで上下にドラッグすると並べ替えられます</p>
            )}
            {[...RANKS, { id: null, label: '未分類', sub: 'まだ決めていない', cls: 'bg-stone-400 text-white' }].map((r) => {
              const rater = raterOf(mode)
              const list = r.id ? laneOf(r.id, rater) : items.filter((w) => !rank(w.id, rater))
              const sortable = Boolean(r.id) && (mode === 'me' || mode === 'agreed')
              const onDragEnd = ({ active, over }) => {
                if (!over || active.id === over.id) return
                const from = list.findIndex((w) => w.id === active.id); const to = list.findIndex((w) => w.id === over.id)
                reorderLane(r.id, rater, arrayMove(list, from, to))
              }
              return (
                <section key={r.id ?? 'none'}>
                  <h3 className="mb-1.5 flex items-baseline gap-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-bold ${r.cls}`}>{r.label}</span>
                    <span className="text-xs text-stone-500">{r.sub}・{list.length}件</span>
                  </h3>
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                    <SortableContext items={list.map((w) => w.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-1.5">
                        {list.map((w, i) => (
                          <SortableCard key={w.id} id={w.id} enabled={sortable} index={r.id ? i + 1 : null} title={w.title} sub={parentTitle(w)} onOpen={() => setOpenId(w.id)} />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </section>
              )
            })}
          </div>
        )}

        {mode === 'compare' && items.length > 0 && (
          <div className="space-y-2">
            {partner && (
              <button className="mb-1 min-h-11 w-full rounded-lg border border-moss text-sm text-moss" onClick={agreeAllMatched}>
                一致しているものをまとめて合意にする
              </button>
            )}
            <div className="grid grid-cols-[1fr_repeat(3,3.5rem)] gap-1 px-2 text-center text-[10px] text-stone-500">
              <span />
              <span className="truncate">{me.display_name}</span>
              <span className="truncate">{partner?.display_name ?? '—'}</span>
              <span>合意</span>
            </div>
            {[...items]
              .sort((a, b) => Number(mismatch(b.id) && !rank(b.id, 'agreed')) - Number(mismatch(a.id) && !rank(a.id, 'agreed')))
              .map((w) => {
                const warn = mismatch(w.id)
                return (
                  <button key={w.id} onClick={() => setOpenId(w.id)}
                    className={`grid min-h-12 w-full grid-cols-[1fr_repeat(3,3.5rem)] items-center gap-1 rounded-xl px-2 py-2 text-left shadow-sm ${warn ? 'bg-amber-50 ring-1 ring-amber-300' : 'bg-white'}`}>
                    <span className="min-w-0 text-sm">
                      {w.title}
                      {warn && <span className="block text-[10px] text-amber-700">評価がちがう → 話し合うポイント</span>}
                    </span>
                    <RankChip id={rank(w.id, me.user_id)} />
                    <RankChip id={partner ? rank(w.id, partner.user_id) : null} />
                    <RankChip id={rank(w.id, 'agreed')} />
                  </button>
                )
              })}
          </div>
        )}
      </div>

      {openId && byId[openId] && (
        <RankSheet
          wish={byId[openId]}
          ctx={ctx}
          partner={partner}
          mode={mode}
          rank={rank}
          setRank={setRank}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  )
}

const isNoSortColumn = (e) => /'sort' column/.test(e?.message || '')

// ドラッグで並べ替えられるカード（≡ の部分をつかむ。スクロールの邪魔をしないように）
function SortableCard({ id, enabled, index, title, sub, onOpen }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !enabled })
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 20 : undefined, position: 'relative' }
  return (
    <div ref={setNodeRef} style={style} className={`flex items-stretch rounded-xl bg-white shadow-sm ${isDragging ? 'opacity-90 shadow-lg ring-2 ring-moss' : ''}`}>
      <button className="flex min-h-12 min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left" onClick={onOpen}>
        {index && <span className="w-5 shrink-0 text-center text-xs font-bold text-stone-400">{index}</span>}
        <span className="min-w-0 flex-1">
          <span className="block text-sm">{title}</span>
          {sub && <span className="block text-[11px] text-stone-400">{sub} ›</span>}
        </span>
      </button>
      {enabled && (
        <button ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label="並べ替え"
          className="flex w-11 shrink-0 cursor-grab items-center justify-center text-lg text-stone-400 active:cursor-grabbing" style={{ touchAction: 'none' }}>
          ≡
        </button>
      )}
    </div>
  )
}

function RankChip({ id }) {
  const r = rankOf(id)
  return (
    <span className={`mx-auto rounded px-1.5 py-0.5 text-[10px] font-bold ${r ? r.cls : 'text-stone-300'}`}>{r ? r.label : '—'}</span>
  )
}

function RankSheet({ wish, ctx, partner, mode, rank, setRank, onClose }) {
  // 比較モードからは「合意」を、それ以外は表示中の評価者を編集する
  const editRater = mode === 'compare' || mode === 'agreed' ? 'agreed' : mode === 'me' ? ctx.me.user_id : null
  const current = editRater ? rank(wish.id, editRater) : null
  const editLabel = editRater === 'agreed' ? 'ふたりの合意' : `${ctx.me.display_name}の評価`

  return (
    <BottomSheet open title={wish.title} onClose={onClose}>
      <div className="space-y-4 text-sm">
        {wish.note && <p className="whitespace-pre-wrap rounded-lg bg-stone-50 p-3 text-stone-700">{wish.note}</p>}

        <div className="flex gap-3 text-xs">
          <span>{ctx.me.display_name}：<RankChip id={rank(wish.id, ctx.me.user_id)} /></span>
          {partner && <span>{partner.display_name}：<RankChip id={rank(wish.id, partner.user_id)} /></span>}
          <span>合意：<RankChip id={rank(wish.id, 'agreed')} /></span>
        </div>

        {editRater ? (
          <section>
            <p className="mb-2 font-bold">{editLabel}を選ぶ</p>
            <div className="grid grid-cols-3 gap-2">
              {RANKS.map((r) => (
                <button key={r.id}
                  className={`flex min-h-14 flex-col items-center justify-center rounded-xl border-2 ${current === r.id ? `${r.cls} border-transparent` : 'border-stone-200 bg-white'}`}
                  onClick={() => setRank(wish.id, editRater, current === r.id ? null : r.id)}>
                  <b>{r.label}</b><span className="text-[10px] opacity-80">{r.sub}</span>
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-stone-400">選び直すと変更、同じものをもう一度押すと未分類に戻ります</p>
          </section>
        ) : (
          <p className="text-xs text-stone-500">パートナーの評価は見るだけです。</p>
        )}

        <section>
          <p className="mb-2 font-bold">リンク・画像</p>
          <Attachments householdId={ctx.household.id} targetType="wish" targetId={wish.id} readOnly />
        </section>
      </div>
    </BottomSheet>
  )
}
