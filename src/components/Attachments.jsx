import { useEffect, useRef, useState } from 'react'
import imageCompression from 'browser-image-compression'
import { supabase } from '../lib/supabase'
import { linkKind } from '../lib/linkKind'

// 要望・土地・建物などに共通で使う「リンク・画像」の添付欄
export default function Attachments({ householdId, targetType, targetId, readOnly = false, onChange }) {
  const [items, setItems] = useState([])
  const [urls, setUrls] = useState({})
  const [linkUrl, setLinkUrl] = useState('')
  const [caption, setCaption] = useState('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(null)
  const fileRef = useRef(null)

  const load = async () => {
    const { data, error } = await supabase
      .from('attachments')
      .select('*')
      .eq('target_type', targetType)
      .eq('target_id', targetId)
      .order('created_at')
    if (error) return alert(error.message)
    setItems(data)
    const paths = data.filter((a) => a.kind === 'image').map((a) => a.storage_path)
    if (paths.length) {
      const { data: signed } = await supabase.storage.from('attachments').createSignedUrls(paths, 3600)
      const map = {}
      signed?.forEach((s) => { if (s.signedUrl) map[s.path] = s.signedUrl })
      setUrls(map)
    }
  }

  useEffect(() => { load() }, [targetId]) // eslint-disable-line react-hooks/exhaustive-deps

  const done = async () => { await load(); onChange?.() }

  const addLink = async () => {
    let u = linkUrl.trim()
    if (!u) return
    if (!/^https?:\/\//.test(u)) u = 'https://' + u
    setBusy(true)
    const { error } = await supabase.from('attachments').insert({
      household_id: householdId, target_type: targetType, target_id: targetId,
      kind: 'link', url: u, caption: caption.trim(),
    })
    setBusy(false)
    if (error) return alert(error.message)
    setLinkUrl(''); setCaption('')
    done()
  }

  const addImages = async (files) => {
    if (!files?.length) return
    setBusy(true)
    try {
      for (const file of files) {
        const small = await imageCompression(file, { maxWidthOrHeight: 1600, initialQuality: 0.8, fileType: 'image/jpeg', useWebWorker: true })
        const path = `${householdId}/${crypto.randomUUID()}.jpg`
        const up = await supabase.storage.from('attachments').upload(path, small, { contentType: 'image/jpeg' })
        if (up.error) throw up.error
        const { error } = await supabase.from('attachments').insert({
          household_id: householdId, target_type: targetType, target_id: targetId,
          kind: 'image', storage_path: path, caption: caption.trim(),
        })
        if (error) throw error
      }
      setCaption('')
    } catch (e) {
      alert('画像の追加に失敗しました：' + e.message)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
      done()
    }
  }

  const remove = async (a) => {
    if (!confirm('この添付を削除しますか？')) return
    if (a.storage_path) await supabase.storage.from('attachments').remove([a.storage_path])
    await supabase.from('attachments').delete().eq('id', a.id)
    done()
  }

  const images = items.filter((a) => a.kind === 'image')
  const links = items.filter((a) => a.kind === 'link')

  return (
    <div className="space-y-3">
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {images.map((a) => (
            <div key={a.id} className="relative">
              <button className="block aspect-square w-full overflow-hidden rounded-lg bg-stone-100" onClick={() => setPreview(a)}>
                {urls[a.storage_path] && <img src={urls[a.storage_path]} alt={a.caption} className="h-full w-full object-cover" />}
              </button>
              {a.caption && <p className="mt-0.5 truncate text-[11px] text-stone-500">{a.caption}</p>}
            </div>
          ))}
        </div>
      )}

      {links.length > 0 && (
        <ul className="space-y-1.5">
          {[...links].sort((x, y) => (linkKind(x.url).kind === 'photos' ? 0 : 1) - (linkKind(y.url).kind === 'photos' ? 0 : 1)).map((a) => {
            const k = linkKind(a.url)
            return (
            <li key={a.id} className={`flex items-center gap-2 rounded-lg px-3 py-2 ${k.cls}`}>
              <a href={a.url} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                <span className="text-lg">{k.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate ${k.kind === 'link' ? 'underline' : 'font-bold'}`}>{a.caption || (k.kind === 'link' ? a.url : k.label)}</span>
                  {k.kind !== 'link' && <span className="block truncate text-[11px] opacity-70">{a.caption ? k.label : 'タップで開く'}</span>}
                </span>
              </a>
              {!readOnly && <button className="px-2 text-stone-400" onClick={() => remove(a)}>✕</button>}
            </li>
            )
          })}
        </ul>
      )}

      {items.length === 0 && <p className="text-sm text-stone-400">リンクや画像はまだありません</p>}

      {!readOnly && (
        <div className="space-y-2 rounded-xl border border-stone-200 p-3">
          <input
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            placeholder="ひとこと（任意）"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
          />
          <div className="flex gap-2">
            <input
              className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm"
              placeholder="URL（Googleフォトの共有アルバムも可）"
              inputMode="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
            />
            <button disabled={busy} className="min-h-11 rounded-lg bg-stone-800 px-3 text-sm text-white disabled:opacity-40" onClick={addLink}>
              リンク追加
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => addImages(e.target.files)} />
          <button disabled={busy} className="min-h-11 w-full rounded-lg border border-dashed border-stone-400 text-sm disabled:opacity-40" onClick={() => fileRef.current?.click()}>
            {busy ? 'アップロード中…' : '＋ 画像を追加（写真・スクショ）'}
          </button>
          <p className="text-[11px] leading-relaxed text-stone-400">🎬 動画は、Googleフォトで見学ごとに共有アルバムを作り、「共有」→「リンクを作成」で出たURLを上に貼ってください。</p>
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-black/90" onClick={() => setPreview(null)}>
          <div className="flex justify-between p-3 text-white">
            <span className="text-sm">{preview.caption}</span>
            <div className="flex gap-4">
              {!readOnly && (
                <button onClick={(e) => { e.stopPropagation(); setPreview(null); remove(preview) }}>削除</button>
              )}
              <button>閉じる</button>
            </div>
          </div>
          <img src={urls[preview.storage_path]} alt="" className="m-auto max-h-[85vh] max-w-full object-contain" />
        </div>
      )}
    </div>
  )
}
