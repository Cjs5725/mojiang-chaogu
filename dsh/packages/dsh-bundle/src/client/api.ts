/**
 * 浏览器半数据面：同源 fetch /mommy/api（node 半桥注册，宿主认证栅栏内）
 * + SSE 失效信号订阅（EventSource 单例，多卡片/停靠共享一条连接）。
 * 桥不可达时静默降级为一次性 fetch（不劣于现状），SSE 失败不重连轰炸。
 */
import type { QuoteView } from './parse.ts'
import { coerceQuote } from './parse.ts'

export interface WatchlistEntry {
  code: string
  name: string | null
  group: string
  note: string | null
}

export interface QuotesPayload {
  source: string
  quotes: QuoteView[]
  error?: string
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: 'same-origin' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as T
}

export function fetchWatchlist(): Promise<WatchlistEntry[]> {
  return fetchJson<WatchlistEntry[]>('/mommy/api/watchlist')
}

/** 桥返回原始 snake_case 字典；这里强制过 coerceQuote 转视图模型（缺失容错）。 */
export async function fetchQuotes(codes: string[]): Promise<QuotesPayload> {
  const raw = await fetchJson<{ source: string; quotes: unknown[]; error?: string }>(
    `/mommy/api/quotes?codes=${encodeURIComponent(codes.join(','))}`,
  )
  const quotes = (raw.quotes ?? [])
    .map(coerceQuote)
    .filter((q): q is QuoteView => q !== null)
  return { source: raw.source, quotes }
}

export type StoreName = 'portfolio'

/** SSE store.changed 帧。 */
interface InvalidationEvent {
  store: StoreName
  revision: number
}

type StoreHandlers = Partial<Record<StoreName, () => void>>

let sharedSource: EventSource | null = null
let sharedHandlers: StoreHandlers = {}
const seenRevisions = new Map<StoreName, number>()

function ensureSource(): EventSource {
  if (sharedSource !== null) return sharedSource
  const source = new EventSource('/mommy/api/events')
  source.addEventListener('store.changed', event => {
    try {
      const payload = JSON.parse(String((event as MessageEvent).data)) as InvalidationEvent
      const last = seenRevisions.get(payload.store)
      if (last !== undefined && payload.revision <= last) return
      seenRevisions.set(payload.store, payload.revision)
      sharedHandlers[payload.store]?.()
    } catch {
      // 帧损坏：忽略（下一次信号仍会触发）
    }
  })
  source.onerror = () => {
    // 宿主桥缺席（headless 错挂等）：关连接，靠调用方一次性 fetch 兜底
    source.close()
    if (sharedSource === source) sharedSource = null
  }
  sharedSource = source
  return source
}

/** 订阅失效信号；返回退订函数（最后一个订阅者退订时关闭共享连接）。 */
export function subscribeMommyEvents(handlers: StoreHandlers): () => void {
  sharedHandlers = { ...sharedHandlers }
  for (const [store, handler] of Object.entries(handlers)) {
    if (handler !== undefined) sharedHandlers[store as StoreName] = handler
  }
  void ensureSource()
  let active = true
  return () => {
    if (!active) return
    active = false
    // 共享单例随首个订阅者建立；退订只摘自己的 handler，连接留给仍订阅者。
    for (const [store, handler] of Object.entries(handlers)) {
      if (handler !== undefined && sharedHandlers[store as StoreName] === handler) {
        delete sharedHandlers[store as StoreName]
      }
    }
  }
}
