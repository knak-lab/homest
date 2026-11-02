import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import BottomSheet from '../components/BottomSheet'
import Attachments from '../components/Attachments'
import Matrix from '../components/Matrix'

export const LAND_STATUS = ['検討中', '見学予定', '見学済', '申込検討', '見送り']
const STATUS_CLS = {
  検討中: 'bg-stone-200 text-stone-700', 見学予定: 'bg-sky-100 text-sky-800', 見学済: 'bg-emerald-100 text-emerald-800',
  申込検討: 'bg-amber-100 text-amber-800', 見送り: 'bg-stone-100 text-stone-400',
}

export default function Lands({ ctx }) {
  const hid = ctx.household.id
  const [view, setView] = useState('list') // list | matrix
  const [groupBy, setGroupBy] = useState('area') // area | agency
  const [lands, setLands] = useState([])
  const [areas, setAreas] = useState([])
  const [agencies, setAgencies] = useState([])
  const [thumbs, setThumbs] = useState({})
  const [openId, setOpenId] = useState(null) // 'new' or id
  const [manage, setManage] = useState(null) // 'area' | 'agency' | null
  const [showRejected, setShowRejected] = useState(false)

  const load = useCallback(async () => {
    const [l, a, g, img] = await Promise.all([
      supabase.from('lands').select('*').eq('household_id', hid).order('created_at'),
      supabase.from('areas').select('*').eq('household_id', hid).order('sort').order('created_at'),
      supabase.from('agencies').select('*').eq('household_id', hid).order('created_at'),
      supabase.from('attachments').select('target_id,storage_path,created_at').eq('household_id', hid).eq('target_type', 'land').eq('kind', 'image').order('created_at'),
    ])
    if (l.error) return alert(l.error.message)
    setLands(l.data); setAreas(a.data || []); setAgencies(g.data || [])
    const first = {}
    img.data?.forEach((r) => { if (!first[r.target_id]) first[r.target_id] = r.storage_path })
    const paths = Object.values(first)
    if (paths.length) {
      const { data } = await supabase.storage.from('attachments').createSignedUrls(paths, 3600)
      const byPath = Object.fromEntries((data || []).map((d) => [d.path, d.signedUrl]))
      setThumbs(Object.fromEntries(Object.entries(first).map(([id, p]) => [id, byPath[p]])))
    } else setThumbs({})
  }, [hid])

  useEffect(() => {
    load()
    const onVis = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [load])

  const groups = useMemo(() => {
    const src = groupBy === 'area' ? areas : agencies
    const key = groupBy === 'area' ? 'area_id' : 'agency_id'
    const list = src.map((g) => ({ id: g.id, name: g.name + (g.branch ? ` ${g.branch}` : ''), items: lands.filter((l) => l[key] === g.id) }))
    const none = lands.filter((l) => !l[key] || !src.find((g) => g.id === l[key]))
    if (none.length) list.push({ id: 'none', name: groupBy === 'area' ? 'エリア未設定' : '不動産会社未設定', items: none })
    return list
  }, [groupBy, areas, agencies, lands])

  const candidates = lands.filter((l) => showRejected || l.status !== '見送り')

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="grid grid-cols-2 gap-1 border-b border-stone-200 bg-paper p-2 text-xs">
        {[['list', '一覧'], ['matrix', '比べる']].map(([v, l]) => (
          <button key={v} className={`min-h-10 rounded-lg ${view === v ? 'bg-moss font-bold text-white' : 'bg-white'}`} onClick={() => setView(v)}>{l}</button>
        ))}
      </div>

      {view === 'list' ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-24">
          <div className="mb-3 flex items-center gap-2 text-xs">
            <div className="grid flex-1 grid-cols-2 rounded-lg bg-stone-200 p-1">
              {[['area', '地域ベース'], ['agency', '不動産会社ベース']].map(([g, l]) => (
                <button key={g} className={`min-h-9 rounded-md ${groupBy === g ? 'bg-white font-bold shadow' : ''}`} onClick={() => setGroupBy(g)}>{l}</button>
              ))}
            </div>
            <button className="min-h-9 rounded-lg border border-stone-300 bg-white px-2" onClick={() => setManage(groupBy)}>
              {groupBy === 'area' ? 'エリア' : '会社'}を管理
            </button>
          </div>

          {lands.length === 0 && (
            <p className="mt-10 text-center text-sm leading-relaxed text-stone-500">候補地はまだありません。<br />右下の「＋ 候補地」から追加してください。</p>
          )}

          <div className="space-y-5">
            {groups.filter((g) => g.items.length || g.id !== 'none').map((g) => (
              <section key={g.id}>
                <h3 className="mb-1.5 text-xs font-bold text-stone-500">{g.name}・{g.items.length}件</h3>
                <div className="space-y-2">
                  {g.items.map((l) => (
                    <button key={l.id} className={`flex w-full gap-3 rounded-xl bg-white p-2 text-left shadow-sm ${l.status === '見送り' ? 'opacity-50' : ''}`} onClick={() => setOpenId(l.id)}>
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-stone-100">
                        {thumbs[l.id] ? <img src={thumbs[l.id]} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-2xl">🗺️</span>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{l.name}</p>
                        <p className="text-xs text-stone-600">
                          {l.price != null && `${Number(l.price).toLocaleString()}万円`}{l.price != null && l.tsubo != null && '・'}{l.tsubo != null && `${l.tsubo}坪`}
                          {l.price != null && l.tsubo ? `（坪${Math.round((l.price / l.tsubo) * 10) / 10}万）` : ''}
                        </p>
                        <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] ${STATUS_CLS[l.status] || STATUS_CLS['検討中']}`}>{l.status}</span>
                      </div>
                    </button>
                  ))}
                  {g.items.length === 0 && <p className="text-xs text-stone-400">候補地なし</p>}
                </div>
              </section>
            ))}
          </div>

          <button className="fixed right-4 bottom-20 z-30 rounded-full bg-moss px-5 py-3 font-bold text-white shadow-lg" onClick={() => setOpenId('new')}>＋ 候補地</button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <label className="flex items-center gap-2 border-b border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-500">
            <input type="checkbox" checked={showRejected} onChange={(e) => setShowRejected(e.target.checked)} /> 見送りも表示
          </label>
          <div className="min-h-0 flex-1">
            <Matrix ctx={ctx} target="land" candidates={candidates} onOpenCandidate={(id) => setOpenId(id)} />
          </div>
        </div>
      )}

      {openId && (
        <LandSheet
          ctx={ctx}
          land={openId === 'new' ? null : lands.find((l) => l.id === openId)}
          areas={areas} agencies={agencies}
          reload={load}
          onClose={() => setOpenId(null)}
        />
      )}
      {manage && <GroupSheet ctx={ctx} kind={manage} rows={manage === 'area' ? areas : agencies} reload={load} onClose={() => setManage(null)} />}
    </div>
  )
}

function LandSheet({ ctx, land, areas, agencies, reload, onClose }) {
  const hid = ctx.household.id
  const [f, setF] = useState(() => ({
    name: land?.name ?? '', area_id: land?.area_id ?? '', agency_id: land?.agency_id ?? '', address: land?.address ?? '',
    price: land?.price ?? '', tsubo: land?.tsubo ?? '', status: land?.status ?? '検討中', url: land?.url ?? '', note: land?.note ?? '',
  }))
  const [id, setId] = useState(land?.id ?? null)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  const payload = () => ({
    name: f.name.trim() || '名称未設定', area_id: f.area_id || null, agency_id: f.agency_id || null, address: f.address,
    price: f.price === '' ? null : Number(f.price), tsubo: f.tsubo === '' ? null : Number(f.tsubo),
    status: f.status, url: f.url, note: f.note, updated_at: new Date().toISOString(),
  })

  const save = async () => {
    if (id) {
      const { error } = await supabase.from('lands').update(payload()).eq('id', id)
      if (error) return alert(error.message), false
    } else {
      const { data, error } = await supabase.from('lands').insert({ household_id: hid, ...payload() }).select().single()
      if (error) return alert(error.message), false
      setId(data.id)
    }
    reload()
    return true
  }

  const close = async () => {
    if (id || f.name.trim()) await save()
    onClose()
  }

  const remove = async () => {
    if (!confirm(`「${f.name}」を削除しますか？`)) return
    const { data: imgs } = await supabase.from('attachments').select('storage_path').eq('target_id', id).eq('kind', 'image')
    const paths = (imgs || []).map((r) => r.storage_path).filter(Boolean)
    if (paths.length) await supabase.storage.from('attachments').remove(paths)
    await supabase.from('lands').delete().eq('id', id)
    reload(); onClose()
  }

  const input = 'w-full rounded-lg border border-stone-300 px-3 py-2'
  return (
    <BottomSheet open title={id ? '候補地' : '候補地を追加'} onClose={close}>
      <div className="space-y-3 text-sm">
        <input className={`${input} py-3 text-base`} placeholder="名前（例：所沢 荒幡）" value={f.name} onChange={set('name')} />
        <div className="grid grid-cols-2 gap-2">
          <Field label="エリア">
            <select className={input} value={f.area_id} onChange={set('area_id')}>
              <option value="">未設定</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="不動産会社">
            <select className={input} value={f.agency_id} onChange={set('agency_id')}>
              <option value="">未設定</option>
              {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}{a.branch ? ` ${a.branch}` : ''}</option>)}
            </select>
          </Field>
          <Field label="価格（万円）"><input className={input} inputMode="decimal" value={f.price} onChange={set('price')} /></Field>
          <Field label="広さ（坪）"><input className={input} inputMode="decimal" value={f.tsubo} onChange={set('tsubo')} /></Field>
        </div>
        <Field label="状況">
          <div className="flex flex-wrap gap-1.5">
            {LAND_STATUS.map((s) => (
              <button key={s} className={`min-h-9 rounded-full px-3 text-xs ${f.status === s ? 'bg-moss text-white' : 'bg-stone-100'}`} onClick={() => setF((x) => ({ ...x, status: s }))}>{s}</button>
            ))}
          </div>
        </Field>
        <Field label="住所"><input className={input} value={f.address} onChange={set('address')} /></Field>
        <Field label="物件ページのURL">
          <div className="flex gap-2">
            <input className={input} inputMode="url" value={f.url} onChange={set('url')} />
            {f.url && <a className="flex items-center rounded-lg bg-stone-100 px-3 text-xs" href={f.url} target="_blank" rel="noreferrer">開く</a>}
          </div>
        </Field>
        {f.address && (
          <a className="block text-xs text-blue-700 underline" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(f.address)}`} target="_blank" rel="noreferrer">📍 Googleマップで見る</a>
        )}
        <Field label="メモ"><textarea className={`${input} min-h-24`} value={f.note} onChange={set('note')} placeholder="見学の感想、気になる点など" /></Field>

        <section>
          <p className="mb-2 font-bold">写真・リンク</p>
          {id ? (
            <Attachments householdId={hid} targetType="land" targetId={id} onChange={reload} />
          ) : (
            <button className="min-h-11 w-full rounded-lg border border-dashed border-stone-400 text-xs" onClick={save}>先に保存すると、写真やリンクを追加できます</button>
          )}
        </section>

        {id && <button className="min-h-11 w-full text-sm text-rose-600" onClick={remove}>この候補地を削除</button>}
      </div>
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

// エリア・不動産会社の管理
function GroupSheet({ ctx, kind, rows, reload, onClose }) {
  const hid = ctx.household.id
  const table = kind === 'area' ? 'areas' : 'agencies'
  const [name, setName] = useState('')
  const [branch, setBranch] = useState('')
  const [editId, setEditId] = useState(null)

  const add = async () => {
    if (!name.trim()) return
    const v = kind === 'area' ? { name: name.trim(), sort: rows.length } : { name: name.trim(), branch: branch.trim() }
    const { error } = await supabase.from(table).insert({ household_id: hid, ...v })
    if (error) return alert(error.message)
    setName(''); setBranch(''); reload()
  }
  const update = async (r, v) => { await supabase.from(table).update(v).eq('id', r.id); reload() }
  const remove = async (r) => {
    if (!confirm(`「${r.name}」を削除しますか？（候補地は「未設定」に移ります）`)) return
    await supabase.from(table).delete().eq('id', r.id); reload()
  }

  const editing = rows.find((r) => r.id === editId)

  return (
    <BottomSheet open title={kind === 'area' ? 'エリア' : '不動産会社'} onClose={onClose}>
      {editing ? (
        <GroupEdit ctx={ctx} kind={kind} row={editing} onSave={(v) => update(editing, v)} onDelete={() => { remove(editing); setEditId(null) }} onBack={() => setEditId(null)} />
      ) : (
        <div className="space-y-4 text-sm">
          <ul className="space-y-1.5">
            {rows.map((r) => (
              <li key={r.id}>
                <button className="flex min-h-11 w-full items-center justify-between rounded-lg bg-stone-50 px-3 text-left" onClick={() => setEditId(r.id)}>
                  <span>{r.name}{r.branch ? ` ${r.branch}` : ''}</span><span className="text-stone-400">›</span>
                </button>
              </li>
            ))}
            {rows.length === 0 && <p className="text-xs text-stone-400">まだありません</p>}
          </ul>
          <div className="space-y-2 rounded-xl border border-stone-200 p-3">
            <input className="w-full rounded-lg border border-stone-300 px-3 py-2" placeholder={kind === 'area' ? 'エリア名（例：所沢市）' : '会社名（例：三井のリハウス）'} value={name} onChange={(e) => setName(e.target.value)} />
            {kind === 'agency' && <input className="w-full rounded-lg border border-stone-300 px-3 py-2" placeholder="店舗・支店（任意）" value={branch} onChange={(e) => setBranch(e.target.value)} />}
            <button className="min-h-11 w-full rounded-lg bg-moss font-bold text-white" onClick={add}>追加</button>
          </div>
        </div>
      )}
    </BottomSheet>
  )
}

function GroupEdit({ ctx, kind, row, onSave, onDelete, onBack }) {
  const [name, setName] = useState(row.name)
  const [branch, setBranch] = useState(row.branch ?? '')
  const [contact, setContact] = useState(row.contact ?? '')
  const [note, setNote] = useState(row.note ?? '')
  const back = () => {
    const v = { name: name.trim() || row.name, note }
    if (kind === 'agency') Object.assign(v, { branch, contact })
    onSave(v); onBack()
  }
  const input = 'w-full rounded-lg border border-stone-300 px-3 py-2'
  return (
    <div className="space-y-3 text-sm">
      <button className="text-xs text-stone-500" onClick={back}>‹ 一覧に戻る（保存）</button>
      <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
      {kind === 'agency' && (
        <>
          <input className={input} placeholder="店舗・支店" value={branch} onChange={(e) => setBranch(e.target.value)} />
          <input className={input} placeholder="担当者・連絡先" value={contact} onChange={(e) => setContact(e.target.value)} />
        </>
      )}
      <textarea className={`${input} min-h-24`} placeholder={kind === 'area' ? 'エリアの印象（通勤、自然、買い物、災害リスクなど）' : '対応の印象など'} value={note} onChange={(e) => setNote(e.target.value)} />
      <p className="font-bold">写真・リンク</p>
      <Attachments householdId={ctx.household.id} targetType={kind} targetId={row.id} />
      <button className="min-h-11 w-full text-rose-600" onClick={onDelete}>削除</button>
    </div>
  )
}
