import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// 種類ごとのひな形（「ひな形から追加」で、まだない項目だけ入る）
export const CHECKLIST_TEMPLATES = {
  land: [
    'ハザードマップ（洪水・土砂災害）を確認',
    '用途地域・建ぺい率・容積率を確認',
    '市街化区域か（調整区域なら建築許可の見込み）',
    '接道（道路の幅4m以上・2m以上接している）',
    '上下水道・ガスの引き込み状況',
    '地盤（地盤調査・造成・擁壁の有無）',
    '境界・測量図の有無',
    '日当たり・眺望を現地で確認',
    '周辺の騒音・におい・交通量',
    '最寄り駅までと通勤時間を実際に確認',
    'スーパー・病院・学校までの距離',
    '朝・夜・休日にも現地を見る',
    '建築条件の有無',
    '諸費用（仲介手数料・登記・造成など）の見積',
  ],
  agency: [
    '担当者の名前と連絡先を控えた',
    '希望条件（エリア・広さ・予算）を伝えた',
    '未公開物件の紹介を依頼した',
    '建築許可・法規の確認を依頼した',
    '仲介手数料を確認した',
    '返信の速さ・対応の印象を確かめた',
  ],
  builder: [
    '資料請求',
    'モデルハウス・見学会に行った',
    '坪単価に含まれる範囲（標準仕様）を確認',
    '断熱性能（UA値）を確認',
    '気密性能（C値）を確認',
    '耐震等級を確認',
    '薪ストーブの施工実績を確認',
    '保証・アフターサービスを確認',
    '見積の内訳（本体・付帯工事・諸費用）を確認',
    '工期を確認',
    '施工中の現場を見学',
    '担当者との相性',
  ],
}

// 候補地・不動産会社・建築会社ごとのチェックリスト（ふたりで共有）
export default function Checklist({ ctx, targetType, targetId, onChange }) {
  const hid = ctx.household.id
  const [items, setItems] = useState([])
  const [text, setText] = useState('')
  const [editing, setEditing] = useState(false)
  const [missing, setMissing] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('checklist_items').select('*')
      .eq('target_type', targetType).eq('target_id', targetId).order('sort').order('created_at')
    if (error) { if (/checklist_items/.test(error.message)) setMissing(true); else alert(error.message); return }
    setItems(data)
  }, [targetType, targetId])

  useEffect(() => { load() }, [load])

  const changed = () => { load(); onChange?.() }

  const add = async (texts) => {
    const rows = texts.map((t, i) => ({ household_id: hid, target_type: targetType, target_id: targetId, text: t, sort: items.length + i }))
    if (!rows.length) return
    const { error } = await supabase.from('checklist_items').insert(rows)
    if (error) return alert(error.message)
    changed()
  }
  const addOne = () => { const t = text.trim(); if (!t) return; setText(''); add([t]) }
  const addTemplate = () => {
    const have = new Set(items.map((i) => i.text))
    const list = CHECKLIST_TEMPLATES[targetType].filter((t) => !have.has(t))
    if (!list.length) return alert('ひな形の項目はすべて入っています')
    add(list)
  }
  const toggle = async (it) => {
    const done = !it.done
    setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, done, done_by: done ? ctx.me.user_id : null } : x)))
    const { error } = await supabase.from('checklist_items')
      .update({ done, done_by: done ? ctx.me.user_id : null, done_at: done ? new Date().toISOString() : null }).eq('id', it.id)
    if (error) { alert(error.message); load() } else onChange?.()
  }
  const remove = async (it) => {
    await supabase.from('checklist_items').delete().eq('id', it.id)
    changed()
  }

  if (missing) {
    return <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">チェックリストを使うには、SupabaseでSQL「0006_checklists.sql」を実行してください。</p>
  }

  const done = items.filter((i) => i.done).length
  const who = (uid) => ctx.members.find((m) => m.user_id === uid)?.display_name

  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100">
            <div className="h-full rounded-full bg-moss" style={{ width: `${(done / items.length) * 100}%` }} />
          </div>
          <span className="text-xs text-stone-500">{done}/{items.length}</span>
          <button className="text-xs text-stone-500 underline" onClick={() => setEditing((v) => !v)}>{editing ? '完了' : '編集'}</button>
        </div>
      )}
      <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-2 px-2">
            <button className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left" onClick={() => !editing && toggle(it)}>
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[11px] ${it.done ? 'border-moss bg-moss text-white' : 'border-stone-300 bg-white'}`}>{it.done ? '✓' : ''}</span>
              <span className={`min-w-0 flex-1 text-sm ${it.done ? 'text-stone-400 line-through' : ''}`}>{it.text}</span>
              {it.done && who(it.done_by) && <span className="shrink-0 text-[10px] text-stone-400">{who(it.done_by)}</span>}
            </button>
            {editing && <button className="px-2 text-stone-400" onClick={() => remove(it)}>✕</button>}
          </li>
        ))}
        {items.length === 0 && <li className="p-3 text-xs text-stone-400">まだ項目がありません</li>}
      </ul>
      <div className="flex gap-2">
        <input className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm" placeholder="項目を追加"
          value={text} enterKeyHint="done" onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addOne() }} />
        <button className="rounded-lg bg-stone-800 px-3 text-sm text-white" onClick={addOne}>追加</button>
      </div>
      <button className="min-h-10 w-full rounded-lg border border-dashed border-stone-300 text-xs text-stone-600" onClick={addTemplate}>
        ＋ ひな形から追加（{targetType === 'land' ? '土地の確認事項' : targetType === 'agency' ? '不動産会社とのやりとり' : '建築会社の確認事項'}）
      </button>
    </div>
  )
}

// 一覧カード用：対象ごとの「済/全体」をまとめて読む
export async function loadChecklistCounts(householdId, targetType) {
  const { data, error } = await supabase.from('checklist_items').select('target_id,done').eq('household_id', householdId).eq('target_type', targetType)
  if (error) return {}
  const m = {}
  data.forEach((r) => { const c = (m[r.target_id] ||= { done: 0, total: 0 }); c.total++; if (r.done) c.done++ })
  return m
}
