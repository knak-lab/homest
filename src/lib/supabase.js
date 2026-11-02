import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// ログインリンクが期限切れ・使用済みのとき、URLにエラーが付いて戻ってくるので先に拾っておく
const params = new URLSearchParams(window.location.hash.slice(1) + '&' + window.location.search.slice(1))
export const authErrorFromUrl = params.get('error_description') || params.get('error_code') || ''

export const isConfigured = Boolean(url && key)
export const supabase = isConfigured ? createClient(url, key) : null
