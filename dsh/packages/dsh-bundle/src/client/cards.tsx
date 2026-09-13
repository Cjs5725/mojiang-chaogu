/**
 * 对话内富卡片（tool.call.toolview keyed slot）：mommy MCP 工具结果 →
 * 结构化卡片。key = 宿主公开工具名 `mcp__mommy-chaogu__<rawName>`。
 *
 * 契约（dsh-trading toolview 同款）：running / 解析失败 → null，回落官方
 * 通用工具行，绝不炸对话流。语义移植自 TUI renderers.py 的十卡片清单中
 * 适合对话流的七张：报价 / 批量报价 / 指数 / 资金流 / K 线迷你表 / 预测 /
 * 自选写回执。
 */
import type { ReactNode } from 'react'
import type { ToolCallOwnerProps } from './types.ts'
import {
  fmtAmountCN,
  fmtPct,
  parseBars,
  parseFlows,
  parseIndexes,
  parsePredictions,
  parseQuote,
  parseQuotes,
  parseWatchlistOp,
  readCall,
  trendOf,
  type ToolCallBlock,
} from './parse.ts'
import type { LocaleKey } from './locales.ts'
import css from './cards.module.css'

/** 框架沿 owner props 注入 t；缺席时回落中文常量（词典缺失不渲染裸键）。 */
export type CardProps = ToolCallOwnerProps & { t?: (key: LocaleKey, params?: Record<string, unknown>) => string }

function Trend({ value, children }: { value: number | null; children: ReactNode }) {
  return (
    <span className={`${css.trend} ${css.num}`} data-trend={trendOf(value)}>
      {children}
    </span>
  )
}

function Head({ title }: { title: string }) {
  return (
    <div className={css.head}>
      <span className={css.title}>{title}</span>
    </div>
  )
}

function Grid({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <div className={css.grid}>
      {rows.map(([k, v]) => (
        <div key={k}>
          <span className={css.k}>{k} </span>
          <span className={css.num}>{v}</span>
        </div>
      ))}
    </div>
  )
}

/** mcp__mommy-chaogu__get_quote：报价卡。 */
export function QuoteCard(props: CardProps) {
  const call = readCall((props.block ?? {}) as ToolCallBlock)
  if (call.resultText === null) return null
  const quote = parseQuote(call.resultText)
  if (quote === null) return null
  const t = props.t
  return (
    <div className={css.card} data-mommy-card="quote">
      <Head title={t?.('card.quote.title') ?? '实时报价'} />
      <div className={css.head}>
        <span className={css.sym}>{quote.name}</span>
        <span className={css.dim}>{quote.code}</span>
        <Trend value={quote.changePct}>
          <span className={css.price}>{quote.price.toFixed(2)}</span>
          <span> {fmtPct(quote.changePct)}</span>
        </Trend>
      </div>
      <Grid
        rows={[
          [t?.('field.open') ?? '开', quote.open?.toFixed(2) ?? '—'],
          [t?.('field.high') ?? '高', quote.high?.toFixed(2) ?? '—'],
          [t?.('field.low') ?? '低', quote.low?.toFixed(2) ?? '—'],
          [t?.('field.prevClose') ?? '昨收', quote.prevClose?.toFixed(2) ?? '—'],
          [t?.('field.volume') ?? '成交量', fmtAmountCN(quote.volume)],
          [t?.('field.turnover') ?? '成交额', fmtAmountCN(quote.turnover)],
          [t?.('field.turnoverRate') ?? '换手', quote.turnoverRate !== null ? `${quote.turnoverRate.toFixed(2)}%` : '—'],
          [t?.('field.pe') ?? 'PE', quote.pe?.toFixed(1) ?? '—'],
          [t?.('field.totalCap') ?? '总市值', fmtAmountCN(quote.totalMarketCap)],
          [t?.('field.circCap') ?? '流通市值', fmtAmountCN(quote.circulatingMarketCap)],
        ]}
      />
      {quote.timestamp !== null && <div className={css.foot}>{quote.timestamp}</div>}
    </div>
  )
}

/** mcp__mommy-chaogu__get_quotes：批量报价迷你表。 */
export function QuotesCard(props: CardProps) {
  const call = readCall((props.block ?? {}) as ToolCallBlock)
  if (call.resultText === null) return null
  const quotes = parseQuotes(call.resultText)
  if (quotes.length === 0) return null
  const t = props.t
  return (
    <div className={css.card} data-mommy-card="quotes">
      <Head title={`${t?.('card.quotes.title') ?? '批量报价'} · ${quotes.length}`} />
      <table className={css.table}>
        <thead>
          <tr>
            <th>{t?.('dock.title') ?? '标的'}</th>
            <th>{t?.('field.close') ?? '价'}</th>
            <th>%</th>
          </tr>
        </thead>
        <tbody>
          {quotes.map(q => (
            <tr key={q.code}>
              <td>
                {q.name} <span className={css.dim}>{q.code}</span>
              </td>
              <td className={css.num}>{q.price.toFixed(2)}</td>
              <td>
                <Trend value={q.changePct}>{fmtPct(q.changePct)}</Trend>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** mcp__mommy-chaogu__get_market_indexes：指数 chip 行。 */
export function IndexesCard(props: CardProps) {
  const call = readCall((props.block ?? {}) as ToolCallBlock)
  if (call.resultText === null) return null
  const indexes = parseIndexes(call.resultText)
  if (indexes.length === 0) return null
  const t = props.t
  return (
    <div className={css.card} data-mommy-card="indexes">
      <Head title={t?.('card.indexes.title') ?? '大盘指数'} />
      <div className={css.chips}>
        {indexes.map(i => (
          <div key={i.code} className={css.chip}>
            <span className={css.name}>{i.name}</span>
            <Trend value={i.changePct}>
              {i.price.toFixed(2)} {fmtPct(i.changePct)}
            </Trend>
          </div>
        ))}
      </div>
    </div>
  )
}

/** mcp__mommy-chaogu__get_money_flow_today：资金流卡。 */
export function FlowCard(props: CardProps) {
  const call = readCall((props.block ?? {}) as ToolCallBlock)
  if (call.resultText === null) return null
  const flows = parseFlows(call.resultText)
  if (flows.length === 0) return null
  const t = props.t
  return (
    <div className={css.card} data-mommy-card="flow">
      <Head title={t?.('card.flow.title') ?? '当日资金流'} />
      <div className={css.list}>
        {flows.map(f => {
          const segments: Array<[string, number | null]> = [
            [t?.('card.flow.superLarge') ?? '超大单', f.superLargeNet],
            [t?.('card.flow.large') ?? '大单', f.largeNet],
            [t?.('card.flow.medium') ?? '中单', f.mediumNet],
            [t?.('card.flow.small') ?? '小单', f.smallNet],
          ]
          const max = Math.max(...segments.map(([, v]) => Math.abs(v ?? 0)), 1)
          return (
            <div key={f.code} className={css.listItem}>
              <div className={css.head}>
                <span className={css.sym}>{f.name}</span>
                <span className={css.dim}>{f.code}</span>
                <Trend value={f.mainNet}>
                  {t?.('card.flow.mainNet') ?? '主力净流入'} {fmtAmountCN(f.mainNet)}
                </Trend>
                {f.mainNetRatio !== null && (
                  <span className={css.dim}>
                    {t?.('card.flow.ratio') ?? '主力净占比'} {f.mainNetRatio.toFixed(2)}%
                  </span>
                )}
              </div>
              {segments.map(([label, value]) =>
                value === null ? null : (
                  <div key={label} className={css.barsBar}>
                    <span className={`${css.k} ${css.dim}`} style={{ minWidth: 42, fontSize: 11 }}>
                      {label}
                    </span>
                    <span className={`${css.trend} ${css.barsBar}`} data-trend={trendOf(value)}>
                      <span className={css.barSeg} style={{ width: `${Math.max((Math.abs(value) / max) * 120, 2)}px` }} />
                    </span>
                    <span className={`${css.num} ${css.trend}`} data-trend={trendOf(value)}>
                      {fmtAmountCN(value)}
                    </span>
                  </div>
                ),
              )}
              {f.timestamp !== null && <div className={css.foot}>{f.timestamp}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** mcp__mommy-chaogu__get_bars：K 线迷你表（最近 8 根 + 更早计数）。 */
export function BarsCard(props: CardProps) {
  const call = readCall((props.block ?? {}) as ToolCallBlock)
  if (call.resultText === null) return null
  const parsed = parseBars(call.resultText)
  if (parsed === null) return null
  const newestFirst = [...parsed.bars].reverse()
  const shown = newestFirst.slice(0, 8)
  const t = props.t
  return (
    <div className={css.card} data-mommy-card="bars">
      <Head title={`${t?.('card.bars.title') ?? 'K 线'} · ${parsed.name || parsed.code}`} />
      <table className={css.table}>
        <thead>
          <tr>
            <th>{t?.('field.date') ?? '日期'}</th>
            <th>{t?.('field.close') ?? '收盘'}</th>
            <th>%</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((b, i) => {
            const prev = shown[i + 1] ?? null
            const chg = b.changePct ?? (prev !== null && prev.close !== 0 ? ((b.close - prev.close) / prev.close) * 100 : null)
            return (
              <tr key={b.timestamp}>
                <td>{b.timestamp.slice(0, 10)}</td>
                <td>{b.close.toFixed(2)}</td>
                <td>
                  <Trend value={chg}>{fmtPct(chg)}</Trend>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {newestFirst.length > shown.length && (
        <div className={css.foot}>
          {(t?.('card.bars.older') ?? '更早 {count} 根').replace('{count}', String(newestFirst.length - shown.length))}
        </div>
      )}
    </div>
  )
}

/** mcp__mommy-chaogu__get_prediction_history：预测卡。 */
export function PredictionsCard(props: CardProps) {
  const call = readCall((props.block ?? {}) as ToolCallBlock)
  if (call.resultText === null) return null
  const predictions = parsePredictions(call.resultText)
  if (predictions.length === 0) return null
  const t = props.t
  return (
    <div className={css.card} data-mommy-card="predictions">
      <Head title={`${t?.('card.predictions.title') ?? '预测历史'} · ${predictions.length}`} />
      <div className={css.list}>
        {predictions.map(p => (
          <div key={p.id ?? `${p.code}-${p.createdAt}`} className={css.listItem}>
            <div className={css.head}>
              <span className={css.sym}>{p.name ?? p.code ?? '?'}</span>
              {p.direction !== null && (
                <span className={css.badge} data-state={p.direction === 'up' ? 'ok' : 'denied'}>
                  {p.direction}
                </span>
              )}
              {p.status !== null && <span className={css.badge}>{p.status}</span>}
              {p.score !== null && <span className={`${css.dim} ${css.num}`}>{p.score.toFixed(2)}</span>}
            </div>
            {p.prediction !== null && <span>{p.prediction}</span>}
            {p.createdAt !== null && <div className={css.foot}>{p.createdAt}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

/** mcp__mommy-chaogu__manage_watchlist：自选写回执（含审批拒绝态）。 */
export function WatchlistOpCard(props: CardProps) {
  const call = readCall((props.block ?? {}) as ToolCallBlock)
  if (call.resultText === null) return null
  const op = parseWatchlistOp(call.argsRaw, call.resultText, call.isError)
  if (op === null) return null
  const t = props.t
  const stateLabel =
    op.state === 'ok'
      ? (t?.('card.watchlistOp.ok') ?? '已执行')
      : op.state === 'denied'
        ? (t?.('card.watchlistOp.denied') ?? '已拒绝')
        : (t?.('card.watchlistOp.error') ?? '失败')
  return (
    <div className={css.card} data-mommy-card="watchlist-op" data-state={op.state}>
      <div className={css.head}>
        <span className={css.title}>{t?.('card.watchlistOp.title') ?? '自选操作'}</span>
        <span className={css.badge} data-state={op.state}>
          {stateLabel}
        </span>
      </div>
      <div className={css.head}>
        <span className={css.sym}>{op.action}</span>
        <span className={css.dim}>{op.code}</span>
        {op.group !== null && <span className={css.dim}>→ {op.group}</span>}
      </div>
      {op.message !== null && <div className={css.foot}>{op.message}</div>}
    </div>
  )
}
