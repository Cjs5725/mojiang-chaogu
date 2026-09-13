/**
 * 左侧自选停靠（shell.overlay）：mommy 自选股 + 批量报价，SSE 失效信号驱动
 * refetch（portfolio 库任何写入——AI 写、TUI/Web 写——都触发重拉）。
 *
 * 数据经 node 半 /mommy/api 同源桥（宿主认证栅栏内）；桥缺席（如错挂
 * headless）显示可重试错误态，永不炸宿主 shell。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchQuotes, fetchWatchlist, subscribeMommyEvents, type WatchlistEntry } from './api.ts'
import { fmtAmountCN, fmtPct, trendOf, type QuoteView } from './parse.ts'
import type { LocaleKey } from './locales.ts'
import css from './dock.module.css'

export interface MommyDockProps {
  t?: (key: LocaleKey, params?: Record<string, unknown>) => string
}

interface DockState {
  entries: WatchlistEntry[]
  quotes: Map<string, QuoteView>
  source: string
  error: string | null
  loading: boolean
}

const EMPTY: DockState = { entries: [], quotes: new Map(), source: '', error: null, loading: true }

export function MommyDock(props: MommyDockProps) {
  const t = props.t
  const [state, setState] = useState<DockState>(EMPTY)
  const [openCode, setOpenCode] = useState<string | null>(null)

  const load = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }))
    try {
      const entries = await fetchWatchlist()
      const codes = entries.map(entry => entry.code)
      let quotes = new Map<string, QuoteView>()
      let source = ''
      if (codes.length > 0) {
        try {
          const payload = await fetchQuotes(codes)
          source = payload.source
          quotes = new Map(payload.quotes.map(q => [q.code, q]))
        } catch {
          // 报价是增强：失败不拖垮自选列表（拉新失败保留旧数据语义）
        }
      }
      setState({ entries, quotes, source, error: null, loading: false })
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      }))
    }
  }, [])

  useEffect(() => {
    void load()
    return subscribeMommyEvents({ portfolio: () => void load() })
  }, [load])

  const groups = useMemo(() => {
    const map = new Map<string, WatchlistEntry[]>()
    for (const entry of state.entries) {
      const list = map.get(entry.group) ?? []
      list.push(entry)
      map.set(entry.group, list)
    }
    return [...map.entries()]
  }, [state.entries])

  if (state.error !== null && state.entries.length === 0) {
    return (
      <div className={css.dock} data-mommy-dock="watchlist">
        <div className={css.center}>
          <span>{t?.('dock.error') ?? '数据不可用'}</span>
          <span className={css.code}>{state.error}</span>
          <button type="button" className={css.button} onClick={() => void load()}>
            {t?.('dock.retry') ?? '重试'}
          </button>
        </div>
      </div>
    )
  }

  if (state.entries.length === 0) {
    return (
      <div className={css.dock} data-mommy-dock="watchlist">
        <div className={css.head}>
          <span className={css.title}>{t?.('dock.title') ?? '自选'}</span>
          <span className={css.grow} />
          <button type="button" className={css.button} aria-pressed={state.loading ? 'true' : 'false'} onClick={() => void load()}>
            {t?.('dock.refresh') ?? '刷新'}
          </button>
        </div>
        <div className={css.empty}>
          <span>{t?.('dock.empty') ?? '自选股为空'}</span>
          <span>{t?.('dock.emptyHint') ?? '在对话里让 AI「把 600519 加进自选」试试'}</span>
        </div>
      </div>
    )
  }

  return (
    <div className={css.dock} data-mommy-dock="watchlist">
      <div className={css.head}>
        <span className={css.title}>
          {t?.('dock.title') ?? '自选'} · {state.entries.length}
        </span>
        <span className={css.grow} />
        <button
          type="button"
          className={css.button}
          aria-pressed={state.loading ? 'true' : 'false'}
          onClick={() => void load()}
        >
          {state.loading ? (t?.('dock.loading') ?? '加载中…') : (t?.('dock.refresh') ?? '刷新')}
        </button>
      </div>
      <div className={css.body}>
        <div className={css.groups}>
          {groups.map(([group, entries]) => (
            <div key={group}>
              <div className={css.groupName}>{group}</div>
              {entries.map(entry => {
                const quote = state.quotes.get(entry.code)
                const trend = trendOf(quote?.changePct ?? null)
                const open = openCode === entry.code
                return (
                  <div
                    key={`${entry.group}:${entry.code}`}
                    className={css.row}
                    data-open={open ? 'true' : 'false'}
                    onClick={() => setOpenCode(open ? null : entry.code)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') setOpenCode(open ? null : entry.code)
                    }}
                  >
                    <div className={css.rowMain}>
                      <span className={css.name}>{entry.name ?? entry.code}</span>
                      <span className={css.code}>{entry.code}</span>
                      {quote !== undefined && (
                        <>
                          <span className={`${css.price} ${css.trend}`} data-trend={trend}>
                            {quote.price.toFixed(2)}
                          </span>
                          <span className={`${css.trend} ${css.price}`} data-trend={trend}>
                            {fmtPct(quote.changePct)}
                          </span>
                        </>
                      )}
                    </div>
                    {open && quote !== undefined && (
                      <div className={css.detail}>
                        <span>
                          {t?.('field.open') ?? '开'} <span className={css.num}>{quote.open?.toFixed(2) ?? '—'}</span>
                        </span>
                        <span>
                          {t?.('field.high') ?? '高'} <span className={css.num}>{quote.high?.toFixed(2) ?? '—'}</span>
                        </span>
                        <span>
                          {t?.('field.low') ?? '低'} <span className={css.num}>{quote.low?.toFixed(2) ?? '—'}</span>
                        </span>
                        <span>
                          {t?.('field.prevClose') ?? '昨收'}{' '}
                          <span className={css.num}>{quote.prevClose?.toFixed(2) ?? '—'}</span>
                        </span>
                        <span>
                          {t?.('field.turnover') ?? '成交额'}{' '}
                          <span className={css.num}>{fmtAmountCN(quote.turnover)}</span>
                        </span>
                        <span>
                          {t?.('field.pe') ?? 'PE'} <span className={css.num}>{quote.pe?.toFixed(1) ?? '—'}</span>
                        </span>
                      </div>
                    )}
                    {open && entry.note !== null && entry.note !== '' && (
                      <div className={css.code}>{entry.note}</div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
      {state.source !== '' && (
        <div className={css.foot}>
          {t?.('dock.source') ?? '来源'}: {state.source}
        </div>
      )}
    </div>
  )
}
