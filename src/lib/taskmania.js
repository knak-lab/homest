import { withIdToken, peekIdToken } from './googleAuth'

// タスクマニアの GAS Web App（読み込みのみ使う）
export const TASKMANIA_GAS_URL = import.meta.env.VITE_TASKMANIA_GAS_URL
  || 'https://script.google.com/macros/s/AKfycby45_yy_-MvrBJrRK4XGZiUYWsluCIs9wW7AgwKFFc_pOA66hHhhpio4mqKoDubYDW-Rg/exec'
export const TASKMANIA_APP_URL = 'https://knak-lab.github.io/taskmania/'

async function getWith(idToken) {
  const url = new URL(TASKMANIA_GAS_URL)
  url.searchParams.set('id_token', idToken)
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`タスクマニアに接続できませんでした（${res.status}）`)
  return res.json()
}

// 家族タブのプロジェクトを読む（ログインが必要ならログインを待つ）
export async function loadFamilyProjects() {
  const data = await withIdToken(getWith)
  if (data && data.ok === false) throw new Error(data.error || 'タスクマニアの読み込みに失敗しました')
  return (data.projects || []).filter((p) => p.owner === '家族')
}

export const hasTaskmaniaToken = () => Boolean(peekIdToken())
