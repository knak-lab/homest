export const RANKS = [
  { id: 'must', label: 'Must', sub: 'ゆずれない', cls: 'bg-rose-600 text-white' },
  { id: 'want', label: 'Want', sub: 'できれば', cls: 'bg-amber-500 text-white' },
  { id: 'nice', label: 'Nice', sub: 'あったらいい', cls: 'bg-sky-500 text-white' },
]
export const rankOf = (id) => RANKS.find((r) => r.id === id)

export const NODE_COLORS = ['#ffffff', '#fde68a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#ddd6fe', '#fed7aa']
