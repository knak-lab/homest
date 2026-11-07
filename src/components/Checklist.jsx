import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// 種類ごとのひな形（カテゴリ別）。「ひな形から追加・整理」で、まだない項目だけ入る
// 重なりがないように、1項目＝1つの確認ごとにしている
export const CHECKLIST_CATEGORIES = {
  land: [
    ['法規・権利', [
      '市街化調整区域なら：どの開発許可で家が建つ予定か（都市計画法の何条か・許可の見込み・期間）',
      '用途地域・建ぺい率・容積率',
      '建築条件の有無',
      '境界確定の有無（境界杭があるか）※未確定だと住宅ローンが組めない可能性',
      '測量図があるか（ない場合は測量費用が別途かかる）',
    ]],
    ['道路', [
      '接道：幅4m以上の道に2m以上接しているか',
      'その土地までの道に狭い所がないか（大型トラック・工事車両が入れるか）',
    ]],
    ['高さ・水・地盤', [
      '敷地内の高低差（造成・擁壁に大きな費用がかからないか）',
      '道路より敷地が低くないか（雨水が入る・たまるおそれ）',
      '排水の勾配がとれる高さ関係か（敷地が広い場合）',
      '地盤の強さ（地盤調査・地盤改良が必要か）',
      'ハザードマップ（洪水・土砂災害）',
    ]],
    ['ライフライン', [
      '水道・排水：上水道か井戸か／下水道か浄化槽か',
      '浄化槽の場合：処理した水を流す側溝が道にあるか',
      'ガス（都市ガスかプロパンか）・電気の引き込み',
    ]],
    ['暮らし・周辺', [
      '日当たり・眺望',
      '朝・夜・休日にも現地を見る（騒音・におい・交通量・人通り）',
      '最寄り駅までと通勤時間を実際に確認',
      'スーパー・病院・学校までの距離',
    ]],
    ['お金', [
      '土地代以外の諸費用の見積（仲介手数料・登記・各種申請など）',
    ]],
  ],
  agency: [
    ['伝える・頼む', [
      '希望条件（エリア・広さ・予算）を伝えた',
      '未公開物件の紹介を依頼した',
      '気になる土地の法規・建築許可の調査を依頼した',
    ]],
    ['確かめる', [
      '担当者の名前と連絡先を控えた',
      '仲介手数料を確認した',
      '信用できそうか（説明が具体的か、リスクや不利な点も話してくれるか・返信の速さ）',
    ]],
  ],
  builder: [
    ['知る・見る', [
      '資料請求',
      'モデルハウス・見学会に行った',
      '施工中の現場を見学',
      '担当者との相性',
    ]],
    ['性能', [
      '断熱性能（UA値）',
      '気密性能（C値）',
      '耐震等級',
      '薪ストーブの施工実績',
    ]],
    ['お金・契約', [
      '見積の内訳と坪単価に含まれる範囲（本体・付帯工事・諸費用・標準仕様）',
      '工期',
      '保証・アフターサービス',
    ]],
  ],
}
export const CHECKLIST_TEMPLATES = Object.fromEntries(
  Object.entries(CHECKLIST_CATEGORIES).map(([k, cats]) => [k, cats.flatMap(([, list]) => list)]),
)
const OTHER = 'その他（自分で追加）'

// 以前のひな形の文言 → 今のひな形の文言（「ひな形から追加・整理」で置き換え、同じものはまとめる）
const RENAMED = {
  '市街化区域か（調整区域なら建築許可の見込み）': '市街化調整区域なら：どの開発許可で家が建つ予定か（都市計画法の何条か・許可の見込み・期間）',
  '用途地域・建ぺい率・容積率を確認': '用途地域・建ぺい率・容積率',
  '接道（道路の幅4m以上・2m以上接している）': '接道：幅4m以上の道に2m以上接しているか',
  '境界・測量図の有無': '境界確定の有無（境界杭があるか）※未確定だと住宅ローンが組めない可能性',
  '上下水道・ガスの引き込み状況': '水道・排水：上水道か井戸か／下水道か浄化槽か',
  'ライフライン：上水道か井戸か／下水道か浄化槽か': '水道・排水：上水道か井戸か／下水道か浄化槽か',
  '地盤（地盤調査・造成・擁壁の有無）': '地盤の強さ（地盤調査・地盤改良が必要か）',
  '敷地内の高低差（処理に大きな費用がかからないか）': '敷地内の高低差（造成・擁壁に大きな費用がかからないか）',
  'ハザードマップ（洪水・土砂災害）を確認': 'ハザードマップ（洪水・土砂災害）',
  '日当たり・眺望を現地で確認': '日当たり・眺望',
  '周辺の騒音・におい・交通量': '朝・夜・休日にも現地を見る（騒音・におい・交通量・人通り）',
  '朝・夜・休日にも現地を見る': '朝・夜・休日にも現地を見る（騒音・におい・交通量・人通り）',
  '諸費用（仲介手数料・登記・造成など）の見積': '土地代以外の諸費用の見積（仲介手数料・登記・各種申請など）',
  '諸費用（仲介手数料・登記・測量・造成など）の見積': '土地代以外の諸費用の見積（仲介手数料・登記・各種申請など）',
  '建築許可・法規の確認を依頼した': '気になる土地の法規・建築許可の調査を依頼した',
  '返信の速さ・対応の印象を確かめた': '信用できそうか（説明が具体的か、リスクや不利な点も話してくれるか・返信の速さ）',
  '信用できそうか（説明が具体的か、リスクや不利な点も話してくれるか）': '信用できそうか（説明が具体的か、リスクや不利な点も話してくれるか・返信の速さ）',
  '坪単価に含まれる範囲（標準仕様）を確認': '見積の内訳と坪単価に含まれる範囲（本体・付帯工事・諸費用・標準仕様）',
  '見積の内訳（本体・付帯工事・諸費用）を確認': '見積の内訳と坪単価に含まれる範囲（本体・付帯工事・諸費用・標準仕様）',
  '断熱性能（UA値）を確認': '断熱性能（UA値）',
  '気密性能（C値）を確認': '気密性能（C値）',
  '耐震等級を確認': '耐震等級',
  '薪ストーブの施工実績を確認': '薪ストーブの施工実績',
  '保証・アフターサービスを確認': '保証・アフターサービス',
  '工期を確認': '工期',
}

// 候補地・不動産会社・建築会社ごとのチェックリスト（ふたりで共有）
export default function Checklist({ ctx, targetType, targetId, onChange }) {
  const hid = ctx.household.id
  const [items, setItems] = useState([])
  const [text, setText] = useState('')
  const [editing, setEditing] = useState(false)
  const [missing, setMissing] = useState(false)
  const [open, setOpen] = useState({})

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('checklist_items').select('*')
      .eq('target_type', targetType).eq('target_id', targetId).order('sort').order('created_at')
    if (error) { if (/checklist_items/.test(error.message)) setMissing(true); else alert(error.message); return }
    setItems(data)
  }, [targetType, targetId])

  useEffect(() => { load() }, [load])

  const changed = () => { load(); onChange?.() }

  const add = async (texts, base = items.length) => {
    const rows = texts.map((t, i) => ({ household_id: hid, target_type: targetType, target_id: targetId, text: t, sort: base + i }))
    if (!rows.length) return
    const { error } = await supabase.from('checklist_items').insert(rows)
    if (error) return alert(error.message)
    changed()
  }
  const addOne = () => { const t = text.trim(); if (!t) return; setText(''); add([t]) }
  // 古い文言を今の文言に置き換え、同じ内容が2つあれば1つにまとめて（どちらかに✓があれば✓を残す）、足りない項目を足す
  const addTemplate = async () => {
    const byText = {}
    const updates = []; const deletes = []
    for (const it of items) {
      const t = RENAMED[it.text] || it.text
      const keep = byText[t]
      if (keep) {
        deletes.push(it.id)
        if (it.done && !keep.done) { keep.done = true; keep.done_by = it.done_by; keep.done_at = it.done_at; keep.dirty = true }
      } else {
        byText[t] = { ...it, text: t, dirty: t !== it.text }
      }
    }
    Object.values(byText).filter((x) => x.dirty).forEach((x) => updates.push(x))
    for (const u of updates) {
      await supabase.from('checklist_items').update({ text: u.text, done: u.done, done_by: u.done_by ?? null, done_at: u.done_at ?? null }).eq('id', u.id)
    }
    if (deletes.length) await supabase.from('checklist_items').delete().in('id', deletes)
    const tpl = CHECKLIST_TEMPLATES[targetType]
    const missingTexts = tpl.filter((t) => !byText[t])
    // ひな形の順に並べ、自分で足した項目はその後ろに
    const kept = Object.values(byText)
    const orderOf = (t) => { const i = tpl.indexOf(t); return i >= 0 ? i : 1000 }
    await Promise.all(kept.map((x, k) => {
      const sort = orderOf(x.text) === 1000 ? 1000 + k : orderOf(x.text)
      return x.sort === sort ? null : supabase.from('checklist_items').update({ sort }).eq('id', x.id)
    }))
    if (missingTexts.length) {
      const rows = missingTexts.map((t) => ({ household_id: hid, target_type: targetType, target_id: targetId, text: t, sort: orderOf(t) }))
      const { error } = await supabase.from('checklist_items').insert(rows)
      if (error) alert(error.message)
    }
    changed()
    if (!missingTexts.length && !updates.length && !deletes.length) alert('ひな形の項目はすべて入っています')
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
  // ひな形のカテゴリに振り分け（自分で足した項目は「その他」）
  const catOf = {}
  CHECKLIST_CATEGORIES[targetType].forEach(([name, list]) => list.forEach((t) => { catOf[t] = name }))
  const groups = [...CHECKLIST_CATEGORIES[targetType].map(([name]) => name), OTHER]
    .map((name) => ({ name, items: items.filter((i) => (catOf[i.text] || OTHER) === name) }))
    .filter((g) => g.items.length)
  const allOpen = groups.length > 0 && groups.every((g) => open[g.name])

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
      {items.length === 0 && <p className="rounded-xl border border-stone-200 p-3 text-xs text-stone-400">まだ項目がありません。下の「ひな形から追加・整理」で定番の確認項目を入れられます。</p>}
      {groups.length > 0 && (
        <div className="flex justify-end">
          <button className="text-[11px] text-stone-500 underline" onClick={() => setOpen(allOpen ? {} : Object.fromEntries(groups.map((g) => [g.name, true])))}>
            {allOpen ? 'すべてたたむ' : 'すべて開く'}
          </button>
        </div>
      )}
      <div className="space-y-1.5">
        {groups.map((g) => {
          const isOpen = open[g.name]
          const d = g.items.filter((i) => i.done).length
          const complete = d === g.items.length
          return (
            <div key={g.name} className="overflow-hidden rounded-xl border border-stone-200">
              <button className={`flex min-h-11 w-full items-center gap-2 px-3 text-left ${complete ? 'bg-moss/10' : 'bg-stone-50'}`} onClick={() => setOpen((o) => ({ ...o, [g.name]: !o[g.name] }))}>
                <span className="text-xs text-stone-400">{isOpen ? '▾' : '▸'}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-bold">{g.name}</span>
                <span className={`text-xs ${complete ? 'font-bold text-moss' : 'text-stone-500'}`}>{complete ? '✓ ' : ''}{d}/{g.items.length}</span>
              </button>
              {isOpen && (
                <ul className="divide-y divide-stone-100 border-t border-stone-200">
                  {g.items.map((it) => (
                    <li key={it.id} className="flex items-center gap-2 px-2">
                      <button className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left" onClick={() => !editing && toggle(it)}>
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[11px] ${it.done ? 'border-moss bg-moss text-white' : 'border-stone-300 bg-white'}`}>{it.done ? '✓' : ''}</span>
                        <span className={`min-w-0 flex-1 text-sm ${it.done ? 'text-stone-400 line-through' : ''}`}>{it.text}</span>
                        {it.done && who(it.done_by) && <span className="shrink-0 text-[10px] text-stone-400">{who(it.done_by)}</span>}
                      </button>
                      {editing && <button className="px-2 text-stone-400" onClick={() => remove(it)}>✕</button>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
      <div className="flex gap-2">
        <input className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm" placeholder="項目を追加"
          value={text} enterKeyHint="done" onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addOne() }} />
        <button className="rounded-lg bg-stone-800 px-3 text-sm text-white" onClick={addOne}>追加</button>
      </div>
      <button className="min-h-10 w-full rounded-lg border border-dashed border-stone-300 text-xs text-stone-600" onClick={addTemplate}>
        ＋ ひな形から追加・整理（{targetType === 'land' ? '土地の確認事項' : targetType === 'agency' ? '不動産会社とのやりとり' : '建築会社の確認事項'}）
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
