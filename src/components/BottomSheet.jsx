export default function BottomSheet({ open, title, onClose, children }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative max-h-[88vh] overflow-y-auto rounded-t-2xl bg-white px-4 pt-3 pb-6 safe-bottom shadow-xl">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-stone-300" />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold">{title}</h2>
          <button className="min-h-11 px-3 text-stone-500" onClick={onClose}>閉じる</button>
        </div>
        {children}
      </div>
    </div>
  )
}
