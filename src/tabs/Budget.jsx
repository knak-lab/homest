import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

// 予算：土地・建物の総額と借入額の試算。お金ちゃんの「家」タブにも埋め込んで同じ画面を表示する
const M2_PER_TSUBO = 3.305785
const FIELDS = ['land_price', 'land_area', 'coverage_ratio', 'tsubo_price', 'down_payment']
const EMPTY = { land_id: null, builder_id: null, land_price: '', land_area: '', coverage_ratio: '', tsubo_price: '', down_payment: '' }

const num = (v) => Number(String(v ?? '').replace(/[,\s]/g, '')) || 0
const fmtMan = (n) => (n ? `${(Math.round(n * 10) / 10).toLocaleString()}万円` : '—')
const fmtInput = (v) => (v === '' || v == null ? '' : Number(v).toLocaleString('ja-JP', { maximumFractionDigits: 2 }))

// 金額・面積などを計算する（お金ちゃん側にも同じ値を渡す）
export function calcPlan(p) {
  const area = num(p.land_area)
  const coverage = num(p.coverage_ratio)
  const buildingTsubo = area > 0 && coverage > 0 ? Math.round((area * coverage) / 100 / M2_PER_TSUBO * 10) / 10 : 0
  const buildingPrice = buildingTsubo * num(p.tsubo_price)
  const landPrice = num(p.land_price)
  const total = landPrice + buildingPrice
  return { buildingTsubo, buildingPrice, landPrice, total, downPayment: num(p.down_payment), loan: total - num(p.down_payment) }
}

export default function Budget({ ctx, embedded }) {
  const hid = ctx.household.id
  const [plan, setPlan] = useState(null) // null = 読み込み中
  const [lands, setLands] = useState([])
  const [builders, setBuilders] = useState([])
  const [status, setStatus] = useState('') // '' | saving | saved | error
  const dirty = useRef(false)
  const exists = useRef(false)
  const rootRef = useRef(null)

  const load = useCallback(async () => {
    if (dirty.current) return // 入力中は読み込み直さない
    const [p, l, b] = await Promise.all([
      supabase.from('house_plans').select('*').eq('household_id', hid).maybeSingle(),
      supabase.from('lands').select('id,name,price,tsubo,status').eq('household_id', hid).order('created_at'),
      supabase.from('builders').select('id,name,branch,tsubo_price,estimate,status').eq('household_id', hid).order('created_at'),
    ])
    if (p.error) return setStatus('error')
    exists.current = Boolean(p.data)
    setPlan(p.data ? { ...EMPTY, ...Object.fromEntries(Object.entries(p.data).map(([k, v]) => [k, v ?? (FIELDS.includes(k) ? '' : v)])) } : { ...EMPTY })
    setLands(l.data || [])
    setBuilders(b.data || [])
  }, [hid])

  useEffect(() => {
    load()
    const onVis = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [load])

  // 入力が止まったら保存
  useEffect(() => {
    if (!plan || !dirty.current) return
    setStatus('saving')
    const t = setTimeout(async () => {
      const row = { household_id: hid, land_id: plan.land_id, builder_id: plan.builder_id, updated_at: new Date().toISOString() }
      FIELDS.forEach((k) => { row[k] = plan[k] === '' ? null : num(plan[k]) })
      const { error } = await supabase.from('house_plans').upsert(row)
      dirty.current = false
      if (error) return setStatus('error')
      exists.current = true
      setStatus('saved')
    }, 800)
    return () => clearTimeout(t)
  }, [plan, hid])

  const update = (patch) => { dirty.current = true; setPlan((p) => ({ ...p, ...patch })) }

  // 埋め込み時：親（お金ちゃん）へ高さと計算結果を伝える。まだ予算がなければ親から初期値を受け取る
  const result = useMemo(() => (plan ? calcPlan(plan) : null), [plan])
  const loaded = plan !== null
  useEffect(() => {
    if (!embedded || !result) return
    window.parent.postMessage({ type: 'homest:plan', plan: result }, window.location.origin)
  }, [embedded, result])
  useEffect(() => {
    const el = rootRef.current
    if (!embedded || !el) return
    const post = () => window.parent.postMessage({ type: 'homest:height', height: el.offsetHeight }, window.location.origin)
    const ro = new ResizeObserver(post)
    ro.observe(el)
    post()
    return () => ro.disconnect()
  }, [embedded, loaded])
  useEffect(() => {
    if (!embedded || !loaded || exists.current) return
    const onMsg = (e) => {
      if (e.origin !== window.location.origin || e.data?.type !== 'homest:seed' || exists.current) return
      const s = e.data.data || {}
      const patch = {}
      FIELDS.forEach((k) => { if (s[k] !== '' && s[k] != null && num(s[k])) patch[k] = num(s[k]) })
      if (Object.keys(patch).length) update(patch)
    }
    window.addEventListener('message', onMsg)
    window.parent.postMessage({ type: 'homest:need-seed' }, window.location.origin)
    return () => window.removeEventListener('message', onMsg)
  }, [embedded, loaded])

  if (!plan) return <p className="p-6 text-center text-sm text-stone-500">読み込み中…</p>

  const r = result
  const land = lands.find((x) => x.id === plan.land_id)
  const builder = builders.find((x) => x.id === plan.builder_id)

  const pickLand = (id) => {
    const l = lands.find((x) => x.id === id)
    update({ land_id: id || null, ...(l ? { land_price: l.price ?? '', land_area: l.tsubo != null ? Math.round(l.tsubo * M2_PER_TSUBO * 100) / 100 : '' } : {}) })
  }
  const pickBuilder = (id) => {
    const b = builders.find((x) => x.id === id)
    update({ builder_id: id || null, ...(b && b.tsubo_price != null ? { tsubo_price: b.tsubo_price } : {}) })
  }

  return (
    <div ref={rootRef} className={embedded ? 'p-3' : 'absolute inset-0 overflow-y-auto p-3 pb-24'}>
      <div className="mx-auto max-w-xl space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-black text-moss">🏡 予算</h2>
          <span className={`text-xs ${status === 'error' ? 'text-rose-600' : 'text-stone-400'}`}>
            {status === 'saving' ? '保存中…' : status === 'saved' ? '✓ 保存済み' : status === 'error' ? '保存できませんでした' : ''}
          </span>
        </div>

        <section className="rounded-xl bg-moss p-4 text-white shadow-sm">
          <p className="text-xs opacity-80">購入総額</p>
          <p className="text-2xl font-black">{fmtMan(r.total)}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <div><p className="opacity-80">頭金</p><p className="text-base font-bold">{fmtMan(r.downPayment)}</p></div>
            <div><p className="opacity-80">借入金</p><p className={`text-base font-bold ${r.loan < 0 ? 'text-rose-200' : ''}`}>{r.total ? fmtMan(r.loan) : '—'}</p></div>
          </div>
        </section>

        <section className="space-y-2 rounded-xl bg-white p-3 shadow-sm">
          <h3 className="text-sm font-bold">🗺️ 土地</h3>
          <Select label="候補地から選ぶ" value={plan.land_id} onChange={pickLand}
            options={lands.map((l) => ({ id: l.id, label: `${l.name}${l.price != null ? `（${Number(l.price).toLocaleString()}万円${l.tsubo != null ? `・${l.tsubo}坪` : ''}）` : ''}${l.status === '見送り' ? '［見送り］' : ''}` }))} />
          <NumRow label="土地代" unit="万円" value={plan.land_price} onChange={(v) => update({ land_price: v })} />
          <NumRow label="面積" unit="m²" value={plan.land_area} onChange={(v) => update({ land_area: v })}
            hint={num(plan.land_area) ? `${Math.round(num(plan.land_area) / M2_PER_TSUBO * 10) / 10}坪` : ''} />
          {land && <p className="text-[11px] text-stone-400">候補地「{land.name}」の価格・坪数を入れました。手で書き換えもできます。</p>}
        </section>

        <section className="space-y-2 rounded-xl bg-white p-3 shadow-sm">
          <h3 className="text-sm font-bold">🏠 建物</h3>
          <Select label="建築会社から選ぶ" value={plan.builder_id} onChange={pickBuilder}
            options={builders.map((b) => ({ id: b.id, label: `${b.name}${b.branch ? ` ${b.branch}` : ''}${b.tsubo_price != null ? `（坪${b.tsubo_price}万円）` : ''}${b.status === '見送り' ? '［見送り］' : ''}` }))} />
          <NumRow label="建ぺい率" unit="%" value={plan.coverage_ratio} onChange={(v) => update({ coverage_ratio: v })} />
          <Row label="建坪">{r.buildingTsubo ? `${r.buildingTsubo}坪` : '—'}<span className="ml-1 text-[11px] text-stone-400">{r.buildingTsubo ? '面積 × 建ぺい率 ÷ 3.306' : ''}</span></Row>
          <NumRow label="坪単価" unit="万円/坪" value={plan.tsubo_price} onChange={(v) => update({ tsubo_price: v })} />
          <Row label="建物代"><span className="font-bold">{fmtMan(r.buildingPrice)}</span></Row>
          {builder?.estimate != null && (
            <p className="text-[11px] text-stone-500">参考：{builder.name}の見積・概算 {Number(builder.estimate).toLocaleString()}万円</p>
          )}
        </section>

        <section className="space-y-2 rounded-xl bg-white p-3 shadow-sm">
          <h3 className="text-sm font-bold">💰 資金</h3>
          <NumRow label="頭金" unit="万円" value={plan.down_payment} onChange={(v) => update({ down_payment: v })} />
          <Row label="借入金"><span className={`font-bold ${r.loan < 0 ? 'text-rose-600' : ''}`}>{r.total ? fmtMan(r.loan) : '—'}</span></Row>
        </section>

        <p className="text-center text-[11px] text-stone-400">homest とお金ちゃんの「家」タブで同じ内容を表示しています</p>
      </div>
    </div>
  )
}

function Row({ label, children }) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-3 text-sm">
      <span className="text-stone-600">{label}</span>
      <span>{children}</span>
    </div>
  )
}

// 3桁区切りで表示する数値入力
function NumRow({ label, unit, value, onChange, hint }) {
  const [draft, setDraft] = useState(null)
  return (
    <div className="flex min-h-10 items-center justify-between gap-3 text-sm">
      <span className="text-stone-600">{label}</span>
      <span className="flex items-center gap-1.5">
        {hint && <span className="text-[11px] text-stone-400">{hint}</span>}
        <input type="text" inputMode="decimal" placeholder="0"
          className="w-28 rounded-lg border border-stone-300 px-2 py-1.5 text-right text-base"
          value={draft ?? fmtInput(value)}
          onFocus={() => setDraft(fmtInput(value))}
          onChange={(e) => {
            const raw = e.target.value
            setDraft(raw)
            const n = Number(raw.replace(/[,\s]/g, ''))
            if (raw.trim() === '') onChange('')
            else if (!Number.isNaN(n)) onChange(n)
          }}
          onBlur={() => setDraft(null)} />
        <span className="w-14 text-xs text-stone-500">{unit}</span>
      </span>
    </div>
  )
}

function Select({ label, value, options, onChange }) {
  return (
    <label className="block text-xs text-stone-500">
      {label}
      <select className="mt-1 min-h-10 w-full rounded-lg border border-stone-300 bg-white px-2 text-sm text-ink"
        value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">（選ばない・手入力）</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </label>
  )
}
