import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

// 予算：土地・建物の総額と借入額の試算。お金ちゃんの「家」タブにも埋め込んで同じ画面を表示する
const M2_PER_TSUBO = 3.305785
const FIELDS = ['land_price', 'land_area', 'coverage_ratio', 'tsubo_price', 'down_payment', 'misc_cost', 'gift']
const EMPTY = { land_id: null, builder_id: null, land_price: '', land_area: '', coverage_ratio: '', tsubo_price: '', down_payment: '', misc_cost: '', gift: '' }

// 諸経費の内訳（家づくりの総額チェックの項目）。build: 建物の工事費の一部（住宅ローン控除の対象に入る）
export const MISC_ITEMS = [
  { key: 'option',     label: 'オプション工事', note: '標準仕様からの追加・変更', build: true },
  { key: 'ancillary',  label: '付帯工事', note: '仮設工事・屋外給排水・ガス工事など（本体の約10〜20%）', build: true, rate: [0.1, 0.2] },
  { key: 'other_work', label: 'その他の工事', note: '構造計算・測量・建築確認申請・地盤改良など', build: true },
  { key: 'tax',        label: '消費税', note: '坪単価が税抜のときだけ（工事費の10%）', build: true },
  { key: 'separate',   label: '別途工事', note: '外構・空調設備・カーテン・照明など' },
  { key: 'fees',       label: '諸費用', note: 'ローン諸費用・火災保険・登記など' },
  // 土地関係費用（不動産会社の住宅購入計画書の「購入諸経費」に合わせた内訳）。土地代金は土地の欄
  { key: 'land_broker',   group: 'land', label: '仲介手数料', note: '土地価格×3%＋6万円＋消費税が上限' },
  { key: 'land_office',   group: 'land', label: '事務手数料', note: '不動産会社の手数料' },
  { key: 'land_register', group: 'land', label: '土地登記費用', note: '所有権移転・先行登記・司法書士' },
  { key: 'land_stamp',    group: 'land', label: '売買契約印紙代', note: '' },
  { key: 'land_tax',      group: 'land', label: '固定資産税・都市計画税の日割り', note: '引き渡し日から年末までの分を売主に払う' },
  { key: 'land_develop',  group: 'land', label: '開発申請費用', note: '' },
  { key: 'land_arakawa',  group: 'land', label: '荒川右岸申請費用', note: '雨水の流出を抑える申請など' },
  { key: 'land_sewer',    group: 'land', label: '受益者負担金（本下水）', note: '市役所' },
  { key: 'land_water',    group: 'land', label: '上水道加入金', note: '市役所' },
  { key: 'land_grading',  group: 'land', label: '造成費用', note: '' },
  { key: 'land_loan',     group: 'land', label: '土地の融資諸経費', note: '銀行保証料・事務手数料・金消契約印紙代など（土地の分）' },
  { key: 'land_reserve',  group: 'land', label: '予備費（土地）', note: '' },
  { key: 'land_fees',     group: 'land', label: 'その他（土地）', note: '' },
  { key: 'furniture',  label: '家具・家電', note: '' },
  { key: 'moving',     label: '引越し', note: '' },
]

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
  // 諸経費も借入金に入れ、頭金で相殺する：借入金＝土地＋建物＋諸経費−頭金。空なら null（お金ちゃんは諸経費率で計算）
  // 内訳が入っていれば、その合計を諸経費にする（なければ諸経費の欄の値）
  const items = p.misc_items || {}
  const hasItems = MISC_ITEMS.some((it) => num(items[it.key]) > 0)
  const itemsTotal = MISC_ITEMS.reduce((t, it) => t + num(items[it.key]), 0)
  const buildExtra = MISC_ITEMS.reduce((t, it) => t + (it.build ? num(items[it.key]) : 0), 0)
  const miscCost = hasItems ? itemsTotal : (p.misc_cost === '' || p.misc_cost == null ? null : num(p.misc_cost))
  const total = landPrice + buildingPrice + (miscCost || 0)
  const downPayment = num(p.down_payment)
  // 贈与（親などからの住宅取得資金）は頭金に充てる。頭金のうち自分の預金から出すのは 頭金−贈与
  const gift = num(p.gift)
  return {
    buildingTsubo, buildingPrice, landPrice, total, downPayment, miscCost, gift, hasItems, buildExtra: hasItems ? buildExtra : 0,
    ownCash: Math.max(0, downPayment - gift),
    loan: total - downPayment,
  }
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
    setPlan(p.data
      ? { ...EMPTY, ...Object.fromEntries(Object.entries(p.data).map(([k, v]) => [k, v ?? (FIELDS.includes(k) ? '' : v)])), misc_items: p.data.misc_items || {} }
      : { ...EMPTY, misc_items: {} })
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
      // 内訳が入っていれば、その合計を諸経費として保存する（お金ちゃん側の古い版でも同じ額になるように）
      const items = Object.fromEntries(Object.entries(plan.misc_items || {}).filter(([, v]) => v !== '' && v != null).map(([k, v]) => [k, num(v)]))
      row.misc_items = Object.keys(items).length ? items : null
      const rr = calcPlan(plan)
      if (rr.hasItems) row.misc_cost = rr.miscCost
      let { error } = await supabase.from('house_plans').upsert(row)
      // 諸経費（migration 0008）・贈与（0009）の列がまだ無いデータベースでは、その列だけ外して保存する
      const dropped = []
      for (const col of ['misc_cost', 'gift', 'misc_items']) {
        if (!error || !String(error.message || '').includes(col)) continue
        delete row[col]
        dropped.push(col)
        ;({ error } = await supabase.from('house_plans').upsert(row))
      }
      if (!error && dropped.some((c) => (c === 'misc_items' ? rr.hasItems : plan[c] !== '' && plan[c] != null))) {
        dirty.current = false; exists.current = true; return setStatus('nomisc')
      }
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
  const landFeesTotal = MISC_ITEMS.reduce((t, it) => t + (it.group === 'land' ? num(plan.misc_items?.[it.key]) : 0), 0)
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
          <span className={`text-xs ${status === 'error' || status === 'nomisc' ? 'text-rose-600' : 'text-stone-400'}`}>
            {status === 'saving' ? '保存中…' : status === 'saved' ? '✓ 保存済み' : status === 'error' ? '保存できませんでした' : status === 'nomisc' ? '諸経費・内訳・贈与が保存できません（データベースの更新が必要）' : ''}
          </span>
        </div>

        <section className="rounded-xl bg-moss p-4 text-white shadow-sm">
          <p className="text-xs opacity-80">購入総額</p>
          <p className="text-2xl font-black">{fmtMan(r.total)}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <div><p className="opacity-80">頭金</p><p className="text-base font-bold">{fmtMan(r.downPayment)}</p></div>
            <div><p className="opacity-80">借入金</p><p className={`text-base font-bold ${r.loan < 0 ? 'text-rose-200' : ''}`}>{r.total ? fmtMan(r.loan) : '—'}</p></div>
          </div>
          {r.miscCost ? <p className="mt-2 text-xs opacity-80">うち諸経費（支出）{fmtMan(r.miscCost)}</p> : null}
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
          {r.hasItems ? (
            <Row label="諸経費"><span className="font-bold">{fmtMan(r.miscCost)}</span><span className="ml-1 text-[11px] text-stone-400">内訳の合計</span></Row>
          ) : (
            <NumRow label="諸経費" unit="万円" value={plan.misc_cost} onChange={(v) => update({ misc_cost: v })}
              hint={r.landPrice + r.buildingPrice ? `目安 ${fmtMan((r.landPrice + r.buildingPrice) * 0.07)}〜${fmtMan((r.landPrice + r.buildingPrice) * 0.1)}` : ''} />
          )}
          <details className="rounded-lg bg-stone-50 px-2 py-1" open={r.hasItems}>
            <summary className="cursor-pointer py-1 text-xs font-bold text-stone-600">諸経費の内訳を入れる</summary>
            {MISC_ITEMS.filter((it) => !it.group).map((it) => (
              <MiscRow key={it.key} it={it} plan={plan} update={update} r={r} />
            ))}
            <details className="my-1 rounded-lg border border-stone-200 bg-white px-2 py-1" open={landFeesTotal > 0}>
              <summary className="flex cursor-pointer items-center justify-between py-1 text-sm text-stone-600">
                <span>土地関係費用<span className="ml-1 text-[11px] text-stone-400">タップで内訳</span></span>
                <span className="font-bold">{landFeesTotal ? fmtMan(landFeesTotal) : '—'}</span>
              </summary>
              {MISC_ITEMS.filter((it) => it.group === 'land').map((it) => (
                <MiscRow key={it.key} it={it} plan={plan} update={update} r={r} />
              ))}
              <p className="pb-1 text-[11px] text-stone-400">不動産会社の「住宅購入計画書」の購入諸経費に合わせた項目です。土地代金は土地の欄に入れます</p>
            </details>
            <p className="pb-1 text-[11px] text-stone-400">1つでも入れると、合計が諸経費になります。本体工事は建物の欄、土地代金は土地の欄です</p>
          </details>
          <p className="text-[11px] text-stone-400">借入金に入れ、頭金で相殺します</p>
          <NumRow label="頭金" unit="万円" value={plan.down_payment} onChange={(v) => update({ down_payment: v })} />
          <NumRow label="うち贈与" unit="万円" value={plan.gift} onChange={(v) => update({ gift: v })} />
          <p className="text-[11px] text-stone-400">
            親などから受け取る住宅取得資金。頭金に充てます。非課税の特例（省エネ等住宅は1,000万円まで）は期限・入居時期の条件があり、
            翌年に贈与税の申告が必要です。税理士に確認を
          </p>
          {r.gift > 0 && (
            <Row label="頭金のうち自分の預金から"><span className="font-bold">{fmtMan(r.ownCash)}</span></Row>
          )}
          <Row label="借入金"><span className={`font-bold ${r.loan < 0 ? 'text-rose-600' : ''}`}>{r.total ? fmtMan(r.loan) : '—'}</span></Row>
        </section>

        <p className="text-center text-[11px] text-stone-400">homest とお金ちゃんの「家」タブで同じ内容を表示しています</p>
      </div>
    </div>
  )
}

// 諸経費の内訳の1行
function MiscRow({ it, plan, update, r }) {
  return (
    <div>
      <NumRow label={it.label} unit="万円" value={plan.misc_items?.[it.key] ?? ''}
        onChange={(v) => update({ misc_items: { ...(plan.misc_items || {}), [it.key]: v } })}
        hint={it.rate && r.buildingPrice ? `目安 ${fmtMan(r.buildingPrice * it.rate[0])}〜${fmtMan(r.buildingPrice * it.rate[1])}` : ''} />
      {it.note && <p className="-mt-1 mb-1 text-[11px] text-stone-400">{it.note}</p>}
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
