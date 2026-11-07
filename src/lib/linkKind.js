// リンクの種類を見分ける（Googleフォトの共有アルバムなどを分かりやすく表示するため）
export function linkKind(url = '') {
  let host = ''
  try { host = new URL(url).hostname.replace(/^www\./, '') } catch { /* noop */ }
  if (host === 'photos.app.goo.gl' || host === 'photos.google.com') return { kind: 'photos', icon: '🎬', label: '動画・写真（Googleフォト）', cls: 'bg-amber-50 text-amber-900 ring-1 ring-amber-200' }
  if (host === 'drive.google.com') return { kind: 'drive', icon: '📁', label: 'Googleドライブ', cls: 'bg-sky-50 text-sky-900 ring-1 ring-sky-200' }
  if (host === 'youtube.com' || host === 'youtu.be' || host === 'm.youtube.com') return { kind: 'youtube', icon: '▶️', label: 'YouTube', cls: 'bg-rose-50 text-rose-900 ring-1 ring-rose-200' }
  return { kind: 'link', icon: '🔗', label: host || 'リンク', cls: 'bg-stone-50 text-blue-700' }
}
