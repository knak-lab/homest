import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ReactFlow, ReactFlowProvider, Background, Handle, Position, BaseEdge,
  useNodesState, useInternalNode, useReactFlow,
} from '@xyflow/react'
import { supabase } from '../lib/supabase'
import { NODE_COLORS } from '../lib/constants'
import BottomSheet from '../components/BottomSheet'
import Attachments from '../components/Attachments'

// ───────── 子ノードの自動配置（360°放射状） ─────────
const angDist = (a, b) => { const d = Math.abs(a - b) % (2 * Math.PI); return d > Math.PI ? 2 * Math.PI - d : d }

function placeChild(parent, wishes) {
  const kids = wishes.filter((w) => w.parent_id === parent.id)
  const used = kids.map((k) => Math.atan2(k.y - parent.y, k.x - parent.x))
  const minGap = (c) => (used.length ? Math.min(...used.map((a) => angDist(a, c))) : Math.PI)
  const gp = wishes.find((w) => w.id === parent.parent_id)
  let angle, R
  if (!gp) {
    // 中心ノード：全周のうち、いちばん空いている方向へ
    R = 210
    const cands = Array.from({ length: 24 }, (_, i) => -Math.PI / 2 + (i * Math.PI) / 12)
    angle = cands.reduce((best, c) => (minGap(c) > minGap(best) + 1e-6 ? c : best), cands[0])
  } else {
    // それ以外：中心から外へ向かう方向を基準に、兄弟と重ならない角度
    R = 170
    const base = Math.atan2(parent.y - gp.y, parent.x - gp.x)
    const cands = [0, 1, -1, 2, -2, 3, -3, 4, -4].map((k) => base + k * 0.45)
    angle = cands.find((c) => minGap(c) >= 0.4) ?? cands.reduce((b, c) => (minGap(c) > minGap(b) ? c : b), cands[0])
  }
  return { x: parent.x + R * Math.cos(angle), y: parent.y + R * Math.sin(angle) }
}

// ───────── 箇条書き（インデント）テキストの読み取り ─────────
// 例：「薪ストーブ」「  ・リビングの中心」のように、字下げで親子を表す
export function parseOutline(text) {
  const lines = text.split(/\r?\n/).map((raw) => {
    const m = raw.replace(/\t/g, '    ').replace(/\u3000/g, '  ').match(/^(\s*)(.*)$/)
    const title = m[2].replace(/^([-*・•●○◯▶▷→]|\d+[.)．、])\s*/, '').trim()
    return { indent: m[1].length, title }
  }).filter((l) => l.title)
  // 字下げ幅がバラついても、前の行より深いか浅いかで階層を決める
  const stack = []
  return lines.map((l) => {
    while (stack.length && l.indent < stack[stack.length - 1]) stack.pop()
    if (!stack.length || l.indent > stack[stack.length - 1]) stack.push(l.indent)
    return { depth: stack.length - 1, title: l.title }
  })
}

// ───────── ノードとエッジの見た目 ─────────
const hiddenHandle = { top: '50%', left: '50%', opacity: 0, pointerEvents: 'none', width: 1, height: 1, minWidth: 0, minHeight: 0, border: 0 }

function WishNode({ data }) {
  const { wish, isRoot, selected, hiddenCount, attachCount, creatorColor } = data
  return (
    <div
      className={`relative rounded-2xl border border-stone-300 px-3 py-2 text-center shadow-sm ${isRoot ? 'min-w-28 text-base font-bold' : 'text-sm'} ${selected ? 'ring-3 ring-moss' : ''}`}
      style={{ background: wish.color, maxWidth: 160 }}
    >
      <Handle type="target" position={Position.Top} style={hiddenHandle} isConnectable={false} />
      <Handle type="source" position={Position.Top} style={hiddenHandle} isConnectable={false} />
      {creatorColor && !isRoot && <span className="absolute -top-1 -left-1 h-2.5 w-2.5 rounded-full border border-white" style={{ background: creatorColor }} />}
      <span className="break-words whitespace-pre-wrap">{wish.title || '（無題）'}</span>
      {(wish.in_priority || attachCount > 0) && (
        <span className="mt-0.5 block text-[10px] text-stone-500">
          {wish.in_priority && '⭐'}{attachCount > 0 && ` 📎${attachCount}`}
        </span>
      )}
      {hiddenCount > 0 && (
        <span className="absolute -right-2 -bottom-2 rounded-full bg-stone-700 px-1.5 text-[10px] text-white">+{hiddenCount}</span>
      )}
    </div>
  )
}

function CenterEdge({ source, target }) {
  const s = useInternalNode(source)
  const t = useInternalNode(target)
  if (!s || !t) return null
  const c = (n) => [n.internals.positionAbsolute.x + (n.measured?.width ?? 0) / 2, n.internals.positionAbsolute.y + (n.measured?.height ?? 0) / 2]
  const [sx, sy] = c(s); const [tx, ty] = c(t)
  return <BaseEdge path={`M${sx},${sy} L${tx},${ty}`} style={{ stroke: '#a8a29e', strokeWidth: 2 }} />
}

const nodeTypes = { wish: WishNode }
const edgeTypes = { center: CenterEdge }

// ───────── 本体 ─────────
export default function MindMap(props) {
  return (
    <ReactFlowProvider>
      <MindMapInner {...props} />
    </ReactFlowProvider>
  )
}

function MindMapInner({ ctx }) {
  const hid = ctx.household.id
  const [wishes, setWishes] = useState([])
  const [attachCounts, setAttachCounts] = useState({})
  const [selectedId, setSelectedId] = useState(null)
  const [focusId, setFocusId] = useState(null)
  const [editId, setEditId] = useState(null)
  const [addParentId, setAddParentId] = useState(null)
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const { fitView } = useReactFlow()

  const load = useCallback(async () => {
    const [w, a] = await Promise.all([
      supabase.from('wishes').select('*').eq('household_id', hid).order('created_at'),
      supabase.from('attachments').select('target_id').eq('household_id', hid).eq('target_type', 'wish'),
    ])
    if (w.error) return alert(w.error.message)
    setWishes(w.data)
    const counts = {}
    a.data?.forEach((r) => { counts[r.target_id] = (counts[r.target_id] || 0) + 1 })
    setAttachCounts(counts)
  }, [hid])

  useEffect(() => {
    load()
    const onVis = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [load])

  const byId = useMemo(() => Object.fromEntries(wishes.map((w) => [w.id, w])), [wishes])
  const childrenOf = useMemo(() => {
    const m = {}
    wishes.forEach((w) => { if (w.parent_id) (m[w.parent_id] ||= []).push(w.id) })
    return m
  }, [wishes])
  const descendants = useCallback((id) => {
    const out = []; const stack = [...(childrenOf[id] || [])]
    while (stack.length) { const x = stack.pop(); out.push(x); stack.push(...(childrenOf[x] || [])) }
    return out
  }, [childrenOf])

  // 表示するノード（折りたたみ・フォーカスを反映）
  const visible = useMemo(() => {
    const roots = focusId && byId[focusId] ? [focusId] : wishes.filter((w) => !w.parent_id).map((w) => w.id)
    const out = []; const stack = [...roots]
    while (stack.length) {
      const id = stack.pop(); out.push(id)
      if (!byId[id]?.collapsed) stack.push(...(childrenOf[id] || []))
    }
    return out
  }, [wishes, byId, childrenOf, focusId])

  useEffect(() => {
    const creator = Object.fromEntries(ctx.members.map((m) => [m.user_id, m.color]))
    setNodes(visible.map((id) => {
      const w = byId[id]
      return {
        id, type: 'wish', position: { x: w.x, y: w.y },
        data: {
          wish: w, isRoot: !w.parent_id, selected: id === selectedId,
          hiddenCount: w.collapsed ? descendants(id).length : 0,
          attachCount: attachCounts[id] || 0,
          creatorColor: creator[w.created_by],
        },
      }
    }))
  }, [visible, byId, selectedId, attachCounts, descendants, ctx.members, setNodes])

  const edges = useMemo(() => {
    const vis = new Set(visible)
    return visible.filter((id) => byId[id].parent_id && vis.has(byId[id].parent_id))
      .map((id) => ({ id: `e-${id}`, source: byId[id].parent_id, target: id, type: 'center' }))
  }, [visible, byId])

  useEffect(() => { setTimeout(() => fitView({ padding: 0.3, duration: 300 }), 50) }, [focusId, fitView])

  const patch = async (id, values) => {
    setWishes((ws) => ws.map((w) => (w.id === id ? { ...w, ...values } : w)))
    const { error } = await supabase.from('wishes').update({ ...values, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) alert(error.message)
  }

  const onNodeDragStop = (_e, node) => patch(node.id, { x: node.position.x, y: node.position.y })

  const addChild = async (parentId, title) => {
    const parent = byId[parentId]
    const pos = placeChild(parent, wishes)
    const { data, error } = await supabase.from('wishes')
      .insert({ household_id: hid, parent_id: parentId, title, ...pos })
      .select().single()
    if (error) return alert(error.message)
    setWishes((ws) => [...ws, data])
    if (parent.collapsed) patch(parentId, { collapsed: false })
  }

  // インデント付きテキストからまとめて追加（OCR結果の貼り付け用）
  const addBulk = async (parentId, text) => {
    const rows = parseOutline(text)
    if (!rows.length) return 0
    let local = [...wishes]
    const stack = [parentId]
    let count = 0
    for (const { depth, title } of rows) {
      const pid = stack[Math.min(depth, stack.length - 1)]
      const parent = local.find((w) => w.id === pid)
      const pos = placeChild(parent, local)
      const { data, error } = await supabase.from('wishes')
        .insert({ household_id: hid, parent_id: pid, title, ...pos })
        .select().single()
      if (error) { alert(error.message); break }
      local = [...local, data]
      stack.length = Math.min(depth, stack.length - 1) + 1
      stack.push(data.id)
      count++
    }
    setWishes(local)
    if (byId[parentId]?.collapsed) patch(parentId, { collapsed: false })
    setTimeout(() => fitView({ padding: 0.3, duration: 300 }), 100)
    return count
  }

  const removeWish = async (id) => {
    const ids = [id, ...descendants(id)]
    const msg = ids.length > 1 ? `「${byId[id].title}」と、その下の ${ids.length - 1} 個もまとめて削除します。よろしいですか？` : `「${byId[id].title}」を削除しますか？`
    if (!confirm(msg)) return
    const { data: imgs } = await supabase.from('attachments').select('storage_path')
      .eq('target_type', 'wish').eq('kind', 'image').in('target_id', ids)
    const paths = (imgs || []).map((r) => r.storage_path).filter(Boolean)
    if (paths.length) await supabase.storage.from('attachments').remove(paths)
    const { error } = await supabase.from('wishes').delete().eq('id', id)
    if (error) return alert(error.message)
    setSelectedId(null); setEditId(null)
    if (ids.includes(focusId)) setFocusId(null)
    load()
  }

  const sel = selectedId && byId[selectedId]

  return (
    <div className="absolute inset-0">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={(_e, n) => setSelectedId(n.id)}
        onPaneClick={() => setSelectedId(null)}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnDoubleClick={false}
        nodeDragThreshold={6}
        minZoom={0.2}
        maxZoom={2.5}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#d6d0c4" gap={24} />
      </ReactFlow>

      {/* 上部：フォーカス表示・全体表示 */}
      <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-between px-3">
        {focusId && byId[focusId] ? (
          <button className="pointer-events-auto rounded-full bg-stone-800 px-3 py-2 text-xs text-white" onClick={() => setFocusId(null)}>
            「{byId[focusId].title}」を表示中 ✕
          </button>
        ) : <span />}
        <button className="pointer-events-auto rounded-full bg-white px-3 py-2 text-xs shadow" onClick={() => fitView({ padding: 0.3, duration: 300 })}>
          全体表示
        </button>
      </div>

      {/* 下部：選択中ノードのアクションバー */}
      {sel && (
        <div className="absolute inset-x-2 bottom-2 rounded-2xl bg-white p-2 shadow-lg">
          <p className="truncate px-2 pb-1 text-xs text-stone-500">{sel.title || '（無題）'}</p>
          <div className="grid grid-cols-5 gap-1 text-[11px]">
            <ActionBtn icon="＋" label="子を追加" onClick={() => setAddParentId(sel.id)} />
            <ActionBtn icon="✎" label="編集" onClick={() => setEditId(sel.id)} />
            <ActionBtn
              icon={sel.collapsed ? '▸' : '▾'}
              label={sel.collapsed ? '開く' : 'たたむ'}
              disabled={!childrenOf[sel.id]?.length}
              onClick={() => patch(sel.id, { collapsed: !sel.collapsed })}
            />
            <ActionBtn icon="◎" label="中心に" onClick={() => { setFocusId(sel.id); setSelectedId(null) }} />
            <ActionBtn icon="🗑" label="削除" disabled={!sel.parent_id} onClick={() => removeWish(sel.id)} />
          </div>
        </div>
      )}

      {addParentId && (
        <AddSheet parent={byId[addParentId]} onAdd={(t) => addChild(addParentId, t)} onBulk={(txt) => addBulk(addParentId, txt)} onClose={() => setAddParentId(null)} />
      )}
      {editId && byId[editId] && (
        <EditSheet
          wish={byId[editId]}
          ctx={ctx}
          onSave={(v) => patch(editId, v)}
          onAttachChange={load}
          onDelete={() => removeWish(editId)}
          onClose={() => setEditId(null)}
        />
      )}
    </div>
  )
}

function ActionBtn({ icon, label, onClick, disabled }) {
  return (
    <button disabled={disabled} onClick={onClick} className="flex min-h-12 flex-col items-center justify-center rounded-lg active:bg-stone-100 disabled:opacity-30">
      <span className="text-base leading-none">{icon}</span>{label}
    </button>
  )
}

// 続けてどんどん追加できるシート（ブレスト向け）
function AddSheet({ parent, onAdd, onBulk, onClose }) {
  const [mode, setMode] = useState('one') // one | bulk
  const [title, setTitle] = useState('')
  const [bulk, setBulk] = useState('')
  const [busy, setBusy] = useState(false)
  const [added, setAdded] = useState([])
  const submit = async () => {
    const t = title.trim()
    if (!t) return
    setTitle('')
    setAdded((a) => [...a, t])
    await onAdd(t)
  }
  const submitBulk = async () => {
    const n = parseOutline(bulk).length
    if (!n) return
    if (!confirm(`${n} 個のノードを「${parent.title}」の下に追加します`)) return
    setBusy(true)
    const done = await onBulk(bulk)
    setBusy(false)
    alert(`${done} 個追加しました`)
    onClose()
  }
  return (
    <BottomSheet open title={`「${parent.title}」に追加`} onClose={onClose}>
      <div className="mb-3 grid grid-cols-2 rounded-lg bg-stone-200 p-1 text-sm">
        {[['one', '1つずつ'], ['bulk', 'まとめて貼り付け']].map(([m, l]) => (
          <button key={m} className={`min-h-10 rounded-md ${mode === m ? 'bg-white font-bold shadow' : ''}`} onClick={() => setMode(m)}>{l}</button>
        ))}
      </div>
      {mode === 'one' ? (
        <>
          <div className="flex gap-2">
            <input
              autoFocus
              className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-3"
              placeholder="やりたいこと・アイデア"
              value={title}
              enterKeyHint="send"
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit() }}
            />
            <button className="min-h-12 rounded-lg bg-moss px-4 font-bold text-white" onClick={submit}>追加</button>
          </div>
          {added.length > 0 && <p className="mt-3 text-xs text-stone-500">追加済み：{added.join('、')}</p>}
        </>
      ) : (
        <div className="space-y-2">
          <p className="text-xs leading-relaxed text-stone-500">1行に1つ。字下げ（スペース）で親子になります。</p>
          <textarea
            className="min-h-56 w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm"
            placeholder={'薪ストーブ\n  リビングの中心に\n  薪置き場\n畑のある暮らし\n  家庭菜園'}
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
          />
          <button disabled={busy} className="min-h-12 w-full rounded-lg bg-moss font-bold text-white disabled:opacity-40" onClick={submitBulk}>
            {busy ? '追加中…' : `まとめて追加（${parseOutline(bulk).length}個）`}
          </button>
        </div>
      )}
    </BottomSheet>
  )
}

function EditSheet({ wish, ctx, onSave, onAttachChange, onDelete, onClose }) {
  const [title, setTitle] = useState(wish.title)
  const [note, setNote] = useState(wish.note)
  const [color, setColor] = useState(wish.color)
  const [inPriority, setInPriority] = useState(wish.in_priority)
  const author = ctx.members.find((m) => m.user_id === wish.created_by)

  const close = () => {
    const v = {}
    if (title !== wish.title) v.title = title
    if (note !== wish.note) v.note = note
    if (color !== wish.color) v.color = color
    if (inPriority !== wish.in_priority) v.in_priority = inPriority
    if (Object.keys(v).length) onSave(v)
    onClose()
  }

  return (
    <BottomSheet open title="編集" onClose={close}>
      <div className="space-y-4 text-sm">
        <input className="w-full rounded-lg border border-stone-300 px-3 py-3 text-base" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="タイトル" />
        <textarea className="min-h-24 w-full rounded-lg border border-stone-300 px-3 py-2" value={note} onChange={(e) => setNote(e.target.value)} placeholder="メモ（なぜやりたい？ どんなイメージ？）" />
        <div className="flex flex-wrap gap-2">
          {NODE_COLORS.map((c) => (
            <button key={c} className={`h-9 w-9 rounded-full border ${color === c ? 'ring-3 ring-moss' : 'border-stone-300'}`} style={{ background: c }} onClick={() => setColor(c)} />
          ))}
        </div>
        {wish.parent_id && (
          <label className="flex min-h-11 items-center justify-between rounded-lg bg-stone-100 px-3">
            <span>⭐ 優先順位に載せる</span>
            <input type="checkbox" className="h-5 w-5 accent-moss" checked={inPriority} onChange={(e) => setInPriority(e.target.checked)} />
          </label>
        )}
        <section>
          <p className="mb-2 font-bold">リンク・画像</p>
          <Attachments householdId={ctx.household.id} targetType="wish" targetId={wish.id} onChange={onAttachChange} />
        </section>
        <div className="flex items-center justify-between pt-2 text-xs text-stone-400">
          <span>{author ? `${author.display_name} が追加` : ''}</span>
          {wish.parent_id && <button className="min-h-11 px-2 text-rose-600" onClick={onDelete}>このノードを削除</button>}
        </div>
      </div>
    </BottomSheet>
  )
}
