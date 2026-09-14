/**
 * 左侧自选停靠（shell.overlay）：mommy 自选股 + 批量报价，SSE 失效信号驱动
 * refetch（portfolio 库任何写入——AI 写、TUI/Web 写——都触发重拉）。
 *
 * 数据经 node 半 /mommy/api 同源桥（宿主认证栅栏内）；桥缺席（如错挂
 * headless）显示可重试错误态，永不炸宿主 shell。
 *
 * 布局契约：面板挂在宿主 overlay 层（AppFrame 的 absolute inset:0 容器，
 * frame 相对坐标）。默认贴侧栏右缘——侧栏宽度从 frame 的内联
 * gridTemplateColumns 读出（宿主可拖拽调宽/折叠），属性级 MutationObserver
 * 跟随；标题栏可拖拽挪动，收起成药丸，两者都落 localStorage。纯 UI 状态，
 * 不涉任何行情计算。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
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

interface DockPos {
  left: number
  top: number
}

interface DockLayout {
  pos: DockPos | null
  collapsed: boolean
}

interface DragGesture {
  pointerId: number
  offX: number
  offY: number
  frameLeft: number
  frameTop: number
  frameWidth: number
  frameHeight: number
}

const EMPTY: DockState = { entries: [], quotes: new Map(), source: '', error: null, loading: true }
const STORAGE_KEY = 'mommy.dock.v1'
const PANEL_WIDTH = 224
const PANEL_MARGIN = 8

const DEFAULT_LAYOUT: DockLayout = { pos: null, collapsed: false }

function loadLayout(): DockLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return DEFAULT_LAYOUT
    const parsed = JSON.parse(raw) as Partial<DockLayout>
    const pos =
      parsed.pos !== undefined &&
      parsed.pos !== null &&
      Number.isFinite(parsed.pos.left) &&
      Number.isFinite(parsed.pos.top)
        ? { left: parsed.pos.left, top: parsed.pos.top }
        : null
    return { pos, collapsed: parsed.collapsed === true }
  } catch {
    return DEFAULT_LAYOUT
  }
}

function saveLayout(layout: DockLayout): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
  } catch {
    // 隐私模式等 storage 不可用：布局不持久化，功能不受影响
  }
}

/** 宿主 AppFrame 在 frame 元素上内联三列 grid 轨道，首列即侧栏当前宽度。 */
function sidebarWidthOf(frame: Element | null | undefined): number {
  if (frame === null || frame === undefined) return 0
  const first = frame.style.gridTemplateColumns.split(' ')[0] ?? ''
  const px = Number.parseFloat(first)
  return Number.isFinite(px) ? px : 0
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

export function MommyDock(props: MommyDockProps) {
  const t = props.t
  const [state, setState] = useState<DockState>(EMPTY)
  const [openCode, setOpenCode] = useState<string | null>(null)
  const [layout, setLayout] = useState<DockLayout>(loadLayout)
  const [sidebarW, setSidebarW] = useState(0)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const layoutRef = useRef(layout)
  const dragRef = useRef<DragGesture | null>(null)

  useEffect(() => {
    layoutRef.current = layout
  }, [layout])

  const applyLayout = useCallback((next: DockLayout) => {
    setLayout(next)
    saveLayout(next)
  }, [])

  // 侧栏实时宽度跟随：AppFrame 拖宽/折叠都写 frame 的 style 与
  // data-sidebar-collapsed 属性，属性级监听足够，不需要宿主类型。
  // slot 渲染位会包 display:contents 包装层，祖先一律用 closest 定位。
  useEffect(() => {
    const overlay = rootRef.current?.closest('[data-shell-overlay]')
    const frame = overlay?.parentElement ?? null
    const update = () => setSidebarW(sidebarWidthOf(frame))
    update()
    if (frame === null) return undefined
    const observer = new MutationObserver(update)
    observer.observe(frame, { attributes: true, attributeFilter: ['style', 'data-sidebar-collapsed'] })
    return () => observer.disconnect()
  }, [])

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

  // —— 拖拽：标题栏是把手（按钮除外），坐标相对 overlay 层（即 frame）。 ——
  const autoLeft = sidebarW + PANEL_MARGIN
  const panelStyle: CSSProperties =
    layout.pos !== null
      ? { left: layout.pos.left, top: layout.pos.top }
      : { left: autoLeft, top: PANEL_MARGIN, bottom: PANEL_MARGIN }

  const onHeadPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if ((event.target as HTMLElement).closest('button') !== null) return
    const root = rootRef.current
    // 拖拽坐标以实际包含块（overlay 层）为参照，包装层变化不影响。
    const container = root?.offsetParent
    if (root === null || root === undefined || container === null || container === undefined) return
    const rootRect = root.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    dragRef.current = {
      pointerId: event.pointerId,
      offX: event.clientX - rootRect.left,
      offY: event.clientY - rootRect.top,
      frameLeft: containerRect.left,
      frameTop: containerRect.top,
      frameWidth: containerRect.width,
      frameHeight: containerRect.height,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onHeadPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (drag === null || event.pointerId !== drag.pointerId) return
    const width = rootRef.current?.offsetWidth ?? PANEL_WIDTH
    const left = clamp(event.clientX - drag.frameLeft - drag.offX, 0, drag.frameWidth - width)
    const top = clamp(event.clientY - drag.frameTop - drag.offY, 0, drag.frameHeight - 40)
    setLayout(prev => ({ ...prev, pos: { left: Math.round(left), top: Math.round(top) } }))
  }

  const onHeadPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (drag === null || event.pointerId !== drag.pointerId) return
    dragRef.current = null
    saveLayout(layoutRef.current)
  }

  const onHeadDoubleClick = (): void => {
    dragRef.current = null
    applyLayout({ ...layoutRef.current, pos: null })
  }

  const headDragProps = {
    onPointerDown: onHeadPointerDown,
    onPointerMove: onHeadPointerMove,
    onPointerUp: onHeadPointerUp,
    onPointerCancel: onHeadPointerUp,
    onDoubleClick: onHeadDoubleClick,
    title: t?.('dock.title') ?? '自选',
  }

  const collapseButton = (
    <button
      type="button"
      className={css.button}
      aria-label={t?.('dock.collapse') ?? '收起'}
      onClick={() => applyLayout({ ...layoutRef.current, collapsed: true })}
    >
      –
    </button>
  )

  if (layout.collapsed) {
    return (
      <button
        type="button"
        className={css.pill}
        data-mommy-dock="watchlist"
        style={{ left: layout.pos !== null ? layout.pos.left : autoLeft, top: layout.pos !== null ? layout.pos.top : PANEL_MARGIN }}
        aria-label={t?.('dock.expand') ?? '展开'}
        onClick={() => applyLayout({ ...layoutRef.current, collapsed: false })}
      >
        <span className={css.pillCount}>
          {t?.('dock.title') ?? '自选'} · {state.entries.length}
        </span>
      </button>
    )
  }

  if (state.error !== null && state.entries.length === 0) {
    return (
      <div className={css.dock} data-mommy-dock="watchlist" style={panelStyle} ref={rootRef}>
        <div className={css.head} {...headDragProps}>
          <span className={css.title}>{t?.('dock.title') ?? '自选'}</span>
          <span className={css.grow} />
          {collapseButton}
        </div>
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
      <div className={css.dock} data-mommy-dock="watchlist" style={panelStyle} ref={rootRef}>
        <div className={css.head} {...headDragProps}>
          <span className={css.title}>{t?.('dock.title') ?? '自选'}</span>
          <span className={css.grow} />
          {collapseButton}
        </div>
        <div className={css.empty}>
          <span>{t?.('dock.empty') ?? '自选股为空'}</span>
          <span>{t?.('dock.emptyHint') ?? '在对话里让 AI「把 600519 加进自选」试试'}</span>
        </div>
      </div>
    )
  }

  return (
    <div className={css.dock} data-mommy-dock="watchlist" style={panelStyle} ref={rootRef}>
      <div className={css.head} {...headDragProps}>
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
        {collapseButton}
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
