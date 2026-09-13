/**
 * 失效信号总线：SSE 只发 `{store, revision}`，永不搬业务负载（dsh-trading
 * eventbus 同款纪律）。
 *
 * 数据源是 mommy 的 portfolio.db（自选/持仓/告警的唯一真相源）文件 mtime——
 * 写操作发生在 MCP 子进程里对 node 半不可见，mtime 轮询是诚实的信号：任何
 * 写入（AI 写、用户在 TUI/Web 写）都改变文件时间。store 名是封闭 union，
 * 目前只有 'portfolio'；客户端收到信号后自己 refetch REST（幂等）。
 */
import { stat } from 'node:fs/promises'
import { join } from 'node:path'

/** 失效信号 store 名（封闭 union：portfolio.db 覆盖自选/持仓/告警）。 */
export type MommyEventStore = 'portfolio'

export interface MommyInvalidationEvent {
  store: MommyEventStore
  revision: number
}

export type MommyEventListener = (event: MommyInvalidationEvent) => void

export interface EventStreamSource {
  subscribe(listener: MommyEventListener): () => void
}

const POLL_INTERVAL_MS = 2_000

/** mtime 轮询 → revision 自增 → 扇出。启动失败（文件不存在）静默降级为零信号。 */
export class RevisionBus implements EventStreamSource {
  private revision = 0
  private lastMtimeMs: number | null = null
  private timer: NodeJS.Timeout | null = null
  private readonly listeners = new Set<MommyEventListener>()
  private readonly dbPath: string
  private readonly intervalMs: number

  constructor(dataDir: string, intervalMs = POLL_INTERVAL_MS) {
    this.dbPath = join(dataDir, 'portfolio.db')
    this.intervalMs = intervalMs
  }

  /** 读当前 mtime 作为基线，避免启动即误发一次信号。 */
  private async poll(emit: boolean): Promise<void> {
    try {
      const stats = await stat(this.dbPath)
      if (this.lastMtimeMs !== null && stats.mtimeMs !== this.lastMtimeMs && emit) {
        this.revision += 1
        const event: MommyInvalidationEvent = { store: 'portfolio', revision: this.revision }
        for (const listener of this.listeners) listener(event)
      }
      this.lastMtimeMs = stats.mtimeMs
    } catch {
      this.lastMtimeMs = null
    }
  }

  start(): void {
    if (this.timer !== null) return
    void this.poll(false)
    this.timer = setInterval(() => {
      void this.poll(true)
    }, this.intervalMs)
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  subscribe(listener: MommyEventListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}

/**
 * 挂 SSE 流：写响应头 + 订阅扇出 + 15s 心跳注释帧；res close/error 时退订
 * 停表。返回清理函数。帧格式与 dsh-trading /dshtrading/api/events 一致：
 *
 *   event: store.changed
 *   data: {"store":"portfolio","revision":3}
 */
export function attachEventStream(
  res: {
    writeHead(status: number, headers?: Record<string, string | number>): void
    write(chunk: string): boolean
    once(event: 'close' | 'error', listener: () => void): unknown
  },
  events: EventStreamSource,
): () => void {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    // 禁缓存 + 禁代理缓冲：失效信号必须实时可达（nginx 默认缓冲会整流挂起）。
    'cache-control': 'no-store',
    'x-accel-buffering': 'no',
  })
  // 立即注释帧：客户端 EventSource onopen 立刻成立，不必等首个事件。
  res.write(': connected\n\n')

  const unsubscribe = events.subscribe(event => {
    res.write(`event: store.changed\ndata: ${JSON.stringify(event)}\n\n`)
  })
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n')
  }, 15_000)

  let cleaned = false
  const cleanup = (): void => {
    if (cleaned) return
    cleaned = true
    clearInterval(heartbeat)
    unsubscribe()
  }
  res.once('close', cleanup)
  res.once('error', cleanup)
  return cleanup
}
