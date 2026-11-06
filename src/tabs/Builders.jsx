import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import BottomSheet from '../components/BottomSheet'
import Attachments from '../components/Attachments'
import Matrix, { EvalSheet, useEval } from '../components/Matrix'
import Checklist, { loadChecklistCounts } from '../components/Checklist'

export const BUILDER_TYPES = ['ハウスメーカー', '設計事務所', '工務店', 'リノベ会社']
export const BUILDER_STATUS = ['情報収集', '問い合わせ済', '打ち合わせ中', '見積もり中', '見送り']
const STATUS_CLS = {
  情報収集: 'bg-stone-200 text-stone-700', 問い合わせ済: 'bg-sky-100 text-sky-800', 打ち合わせ中: 'bg-emerald-100 text-emerald-800',
  見積もり中: 'bg-amber-100 text-amber-800', 見送り: 'bg-stone-100 text-stone-400',
}
const TYPE_ICON = { ハウスメーカー: '🏭', 設計事務所: '📐', 工務店: '🔨', リノベ会社: '🛠️' }

export default function Builders({ ctx }) {
  const hid = ctx.household.id
  const [view, setView] = useState('list') // list | matrix
  const [filter, setFilter] = useState('すべて')
  const [rows, setRows] = useState([])
  const [thumbs, setThumbs] = useState({})
  const [checks, setChecks] = useState({})
  const [openId, setOpenId] = useState(null) // 'new' or id
  const [showRejected, setShowRejected] = useState(false)
  const ev = useEval(ctx, 'builder')
  const partner = ctx.members.find((m) => m.user_id !== ctx.me.user_id)

  const load = useCallback(async () => {
    const [b, img] = await Promise.all([
      supabase.from('builders').select('*').eq('household_id', hid).order('created_at'),
      supabase.from('attachments').select('target_id,storage_path,created_at').eq('household_id', hid).eq('target_type', 'builder').eq('kind', 'image').order('created_at'),
    ])
    if (b.error) return alert(b.error.message)
    setRows(b.data)
    loadChecklistCounts(hid, 'builder').then(setChecks)
    const first = {}
    img.data?.forEach((r) => { if (!first[r.target_id]) first[r.target_id] = r.storage_path })
    const paths = Object.values(first)
    if (paths.length) {
      const { data } = await supabase.storage.from('attachments').createSignedUrls(paths, 3600)
      const byPath = Object.fromEntries((data || []).map((d) => [d.path, d.signedUrl]))
      setThumbs(Object.fromEntries(Object.entries(first).map(([id, p]) => [id, byPath[p]])))
    } else setThumbs({})
  }, [hid])

  const reloadAll = () => { load(); ev.load() }

  useEffect(() => {
    load()
    const onVis = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [load])

  const groups = useMemo(() => {
    const types = filter === 'すべて' ? BUILDER_TYPES : [filter]
    return types.map((t) => ({ type: t, items: rows.filter((r) => r.type === t) }))
  }, [rows, filter])

  const candidates = rows.filter((r) => (showRejected || r.status !== '見送り') && (filter === 'すべて' || r.type === filter))

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="grid grid-cols-2 gap-1 border-b border-stone-200 bg-paper p-2 text-xs">
        {[['list', '一覧'], ['matrix', '比べる']].map(([v, l]) => (
          <button key={v} className={`min-h-10 rounded-lg ${view === v ? 'bg-moss font-bold text-white' : 'bg-white'}`} onClick={() => setView(v)}>{l}</button>
        ))}
      </div>
      <div className="flex gap-1.5 overflow-x-auto border-b border-stone-200 bg-paper px-2 py-2 text-xs">
        {['すべて', ...BUILDER_TYPES].map((t) => (
          <button key={t} className={`min-h-9 shrink-0 rounded-full px-3 ${filter === t ? 'bg-stone-800 text-white' : 'bg-white'}`} onClick={() => setFilter(t)}>{t}</button>
        ))}
      </div>

      {view === 'list' ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-24">
          {rows.length === 0 && (
            <p className="mt-10 text-center text-sm leading-relaxed text-stone-500">建築会社はまだありません。<br />右下の「＋ 会社」から追加してください。</p>
          )}
          <div className="space-y-5">
            {groups.filter((g) => g.items.length || filter !== 'すべて').map((g) => (
              <section key={g.type}>
                <h3 className="mb-1.5 text-xs font-bold text-stone-500">{TYPE_ICON[g.type]} {g.type}・{g.items.length}件</h3>
                <div className="space-y-2">
                  {g.items.map((b) => (
                    <button key={b.id} className={`flex w-full gap-3 rounded-xl bg-white p-2 text-left shadow-sm ${b.status === '見送り' ? 'opacity-50' : ''}`} onClick={() => setOpenId(b.id)}>
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-stone-100">
                        {thumbs[b.id] ? <img src={thumbs[b.id]} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-2xl">{TYPE_ICON[b.type]}</span>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{b.name}{b.branch ? <span className="font-normal text-stone-500"> {b.branch}</span> : null}</p>
                        <p className="text-xs text-stone-600">{b.tsubo_price != null ? `坪${b.tsubo_price}万円` : '坪単価 —'}</p>
                        <p className="text-xs text-stone-600">{b.estimate != null ? `見積 ${Number(b.estimate).toLocaleString()}万円` : '見積 —'}</p>
                        <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] ${STATUS_CLS[b.status] || STATUS_CLS['情報収集']}`}>{b.status}</span>
                        {checks[b.id] && <span className="mt-1 ml-1 inline-block rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-600">☑ {checks[b.id].done}/{checks[b.id].total}</span>}
                      </div>
                      {ev.criteria.length > 0 && (
                        <div className="flex shrink-0 gap-1 self-center">
                          {[['common', '共通'], ['me', '自分'], ['partner', partner?.display_name ?? 'パートナー']].map(([m, lbl]) => {
                            const s = ev.summary(b.id, m)
                            return (
                              <div key={m} className={`w-11 rounded-lg py-1 text-center ${m === 'common' ? 'bg-moss/10' : 'bg-stone-50'}`}>
                                <p className="truncate px-0.5 text-[9px] text-stone-500">{lbl}</p>
                                <p className={`text-base leading-tight font-black ${s.failed ? 'text-stone-400' : m === 'common' ? 'text-moss' : 'text-stone-700'}`}>{s.failed ? '✕' : s.total ?? '—'}</p>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </button>
                  ))}
                  {g.items.length === 0 && <p className="text-xs text-stone-400">まだありません</p>}
                </div>
              </section>
            ))}
          </div>
          <button className="fixed right-4 bottom-20 z-30 rounded-full bg-moss px-5 py-3 font-bold text-white shadow-lg" onClick={() => setOpenId('new')}>＋ 会社</button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <label className="flex items-center gap-2 border-b border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-500">
            <input type="checkbox" checked={showRejected} onChange={(e) => setShowRejected(e.target.checked)} /> 見送りも表示
          </label>
          <div className="min-h-0 flex-1">
            <Matrix ctx={ctx} target="builder" candidates={candidates} onOpenCandidate={(id) => setOpenId(id)} />
          </div>
        </div>
      )}

      {openId && (
        <BuilderSheet
          ctx={ctx}
          row={openId === 'new' ? null : rows.find((r) => r.id === openId)}
          defaultType={filter === 'すべて' ? 'ハウスメーカー' : filter}
          reload={reloadAll}
          onClose={() => { setOpenId(null); ev.load() }}
        />
      )}
    </div>
  )
}

function BuilderSheet({ ctx, row, defaultType, reload, onClose }) {
  const hid = ctx.household.id
  const [f, setF] = useState(() => ({
    name: row?.name ?? '', type: row?.type ?? defaultType, branch: row?.branch ?? '', contact: row?.contact ?? '',
    url: row?.url ?? '', tsubo_price: row?.tsubo_price ?? '', estimate: row?.estimate ?? '', status: row?.status ?? '情報収集', note: row?.note ?? '',
  }))
  const [id, setId] = useState(row?.id ?? null)
  const [evalOpen, setEvalOpen] = useState(false)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  const payload = () => ({
    name: f.name.trim() || '名称未設定', type: f.type, branch: f.branch, contact: f.contact, url: f.url,
    tsubo_price: f.tsubo_price === '' ? null : Number(f.tsubo_price), estimate: f.estimate === '' ? null : Number(f.estimate),
    status: f.status, note: f.note, updated_at: new Date().toISOString(),
  })

  const save = async () => {
    if (id) {
      const { error } = await supabase.from('builders').update(payload()).eq('id', id)
      if (error) { alert(error.message); return false }
    } else {
      const { data, error } = await supabase.from('builders').insert({ household_id: hid, ...payload() }).select().single()
      if (error) { alert(error.message); return false }
      setId(data.id)
    }
    reload()
    return true
  }

  const close = async () => { if (id || f.name.trim()) await save(); onClose() }

  const remove = async () => {
    if (!confirm(`「${f.name}」を削除しますか？`)) return
    const { data: imgs } = await supabase.from('attachments').select('storage_path').eq('target_id', id).eq('kind', 'image')
    const paths = (imgs || []).map((r) => r.storage_path).filter(Boolean)
    if (paths.length) await supabase.storage.from('attachments').remove(paths)
    await supabase.from('builders').delete().eq('id', id)
    reload(); onClose()
  }

  const input = 'w-full rounded-lg border border-stone-300 px-3 py-2'
  return (
    <BottomSheet open title={id ? '建築会社' : '建築会社を追加'} onClose={close}>
      <div className="space-y-3 text-sm">
        <input className={`${input} py-3 text-base`} placeholder="会社名（例：〇〇工務店）" value={f.name} onChange={set('name')} />
        <button className="min-h-12 w-full rounded-xl bg-moss font-bold text-white disabled:opacity-40" disabled={!id && !f.name.trim()}
          onClick={async () => { if (!id) { const ok = await save(); if (!ok) return } setEvalOpen(true) }}>
          ⭐ この会社を評価する
        </button>
        <Field label="種別">
          <div className="flex flex-wrap gap-1.5">
            {BUILDER_TYPES.map((t) => (
              <button key={t} className={`min-h-9 rounded-full px-3 text-xs ${f.type === t ? 'bg-stone-800 text-white' : 'bg-stone-100'}`} onClick={() => setF((x) => ({ ...x, type: t }))}>{TYPE_ICON[t]} {t}</button>
            ))}
          </div>
        </Field>
        <Field label="状況">
          <div className="flex flex-wrap gap-1.5">
            {BUILDER_STATUS.map((s) => (
              <button key={s} className={`min-h-9 rounded-full px-3 text-xs ${f.status === s ? 'bg-moss text-white' : 'bg-stone-100'}`} onClick={() => setF((x) => ({ ...x, status: s }))}>{s}</button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="坪単価の目安（万円）"><input className={input} inputMode="decimal" value={f.tsubo_price} onChange={set('tsubo_price')} /></Field>
          <Field label="見積・概算（万円）"><input className={input} inputMode="decimal" value={f.estimate} onChange={set('estimate')} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="店舗・展示場"><input className={input} value={f.branch} onChange={set('branch')} /></Field>
          <Field label="担当者・連絡先"><input className={input} value={f.contact} onChange={set('contact')} /></Field>
        </div>
        <Field label="ホームページ・資料のURL">
          <div className="flex gap-2">
            <input className={input} inputMode="url" value={f.url} onChange={set('url')} />
            {f.url && <a className="flex items-center rounded-lg bg-stone-100 px-3 text-xs" href={f.url} target="_blank" rel="noreferrer">開く</a>}
          </div>
        </Field>
        <Field label="メモ"><textarea className={`${input} min-h-24`} value={f.note} onChange={set('note')} placeholder="打ち合わせの印象、得意なこと、気になる点など" /></Field>

        <section>
          <p className="mb-2 font-bold">チェックリスト</p>
          {id ? (
            <Checklist ctx={ctx} targetType="builder" targetId={id} onChange={reload} />
          ) : (
            <button className="min-h-11 w-full rounded-lg border border-dashed border-stone-400 text-xs" onClick={save}>先に保存すると、チェックリストを使えます</button>
          )}
        </section>

        <section>
          <p className="mb-2 font-bold">写真・リンク</p>
          {id ? (
            <Attachments householdId={hid} targetType="builder" targetId={id} onChange={reload} />
          ) : (
            <button className="min-h-11 w-full rounded-lg border border-dashed border-stone-400 text-xs" onClick={save}>先に保存すると、写真やリンクを追加できます</button>
          )}
        </section>

        {id && <button className="min-h-11 w-full text-sm text-rose-600" onClick={remove}>この会社を削除</button>}
      </div>
      {evalOpen && id && <EvalSheet ctx={ctx} target="builder" candidate={{ id, name: f.name || '建築会社' }} onClose={() => { setEvalOpen(false); reload() }} />}
    </BottomSheet>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <span className="mb-1 block text-xs text-stone-500">{label}</span>
      {children}
    </div>
  )
}
