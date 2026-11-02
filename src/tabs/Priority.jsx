import { useCallback, useEffect, useMemo, useState } from 'react'
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
  const [mode, setMode] = useState('me') // me | partner | agreed | compare
  const [openId, setOpenId] = useState(null)

  const load = useCallback(async () => {
    const [w, r] = await Promise.all([
      supabase.from('wishes').select('*').eq('household_id', hid),
      supabase.from('ratings').select('*').eq('household_id', hid).eq('target_type', 'wish'),
    ])
    if (w.error) return alert(w.error.message)
    setWishes(w.data)
    const map = {}
    r.data?.forEach((x) => { map[`${x.target_id}|${x.rater}`] = x.rank })
    setRatings(map)
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

  const setRank = async (wishId, rater, value) => {
    setRatings((r) => ({ ...r, [`${wishId}|${rater}`]: value }))
    const { error } = await supabase.from('ratings').upsert(
      { household_id: hid, target_type: 'wish', target_id: wishId, rater, rank: value, updated_at: new Date().toISOString() },
      { onConflict: 'target_type,target_id,rater' },
    )
    if (error) { alert(error.message); load() }
  }

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
            {[...RANKS, { id: null, label: '未分類', sub: 'まだ決めていない', cls: 'bg-stone-400 text-white' }].map((r) => {
              const list = items.filter((w) => rank(w.id, raterOf(mode)) === r.id)
              return (
                <section key={r.id ?? 'none'}>
                  <h3 className="mb-1.5 flex items-baseline gap-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-bold ${r.cls}`}>{r.label}</span>
                    <span className="text-xs text-stone-500">{r.sub}・{list.length}件</span>
                  </h3>
                  <div className="space-y-1.5">
                    {list.map((w) => (
                      <button key={w.id} className="flex min-h-12 w-full flex-col items-start rounded-xl bg-white px-3 py-2 text-left shadow-sm" onClick={() => setOpenId(w.id)}>
                        <span className="text-sm">{w.title}</span>
                        {parentTitle(w) && <span className="text-[11px] text-stone-400">{parentTitle(w)} ›</span>}
                      </button>
                    ))}
                  </div>
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
