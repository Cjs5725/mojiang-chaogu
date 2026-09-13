/**
 * 对话内富卡片（tool.call.toolview keyed slot）：mommy MCP 工具结果 →
 * 结构化卡片。key = 宿主公开工具名 `mcp__mommy-chaogu__<rawName>`。
 *
 * 契约（dsh-trading toolview 同款）：running / 解析失败 → null，回落官方
 * 通用工具行，绝不炸对话流。十三张卡：报价 / 批量报价 / 指数 / 资金流 /
 * K 线迷你表（含 MA 列）/ 预测 / 自选写回执 + 信号 / 回测 / 历史资金流 /
 * 主力筛选 / 相似事件 / 研究结论回执。
 */
import type { ReactNode } from 'react'
import type { ToolCallOwnerProps } from './types.ts'
import {
  fmtAmountCN,
  fmtPct,
  parseBacktest,
  parseBars,
  parseFlowHistory,
  parseFlows,
  parseIndexes,
  parseKlineSignal,
  parsePredictions,
  parseQuote,
  parseQuotes,
  parseRecordConclusion,
  parseScreenInflow,
  parseSimilarEvents,
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
  // include_ma 时服务端已附 ma_<w> 字段——这里只取窗口名列表渲染列，不在浏览器算指标
  const maWindows = [...new Set(parsed.bars.flatMap(b => Object.keys(b.ma)))].sort((a, b) => Number(a) - Number(b))
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
            {maWindows.map(w => (
              <th key={w}>MA{w}</th>
            ))}
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
                {maWindows.map(w => (
                  <td key={w}>{b.ma[w] !== null && b.ma[w] !== undefined ? b.ma[w]!.toFixed(2) : '—'}</td>
                ))}
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

/** mcp__mommy-chaogu__check_kline_signal：K 线信号卡（放量上涨 / 均线金叉，窗口自定义）。 */
export function KlineSignalCard(props: CardProps) {
  const call = readCall((props.block ?? {}) as ToolCallBlock)
  if (call.resultText === null) return null
  const hits = parseKlineSignal(call.resultText)
  if (hits.length === 0) return null
  const t = props.t
  return (
    <div className={css.card} data-mommy-card="kline-signal">
      <Head title={`${t?.('card.signal.title') ?? 'K 线信号'} · ${hits.length}`} />
      <table className={css.table}>
        <thead>
          <tr>
            <th>{t?.('dock.title') ?? '标的'}</th>
            <th>{t?.('card.signal.type') ?? '信号'}</th>
            <th>{t?.('field.close') ?? '收盘'}</th>
            <th>%</th>
          </tr>
        </thead>
        <tbody>
          {hits.map(h => (
            <tr key={h.code}>
              <td>
                {h.name} <span className={css.dim}>{h.code}</span>
              </td>
              <td>
                {h.signal === 'ma_golden_cross' && h.fast !== null && h.slow !== null
                  ? `MA${h.fast}↑MA${h.slow}`
                  : h.signal}
              </td>
              <td className={css.num}>{h.close?.toFixed(2) ?? '—'}</td>
              <td>
                <Trend value={h.changePct}>{fmtPct(h.changePct)}</Trend>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {hits[0]?.volumeRatio !== null && hits[0]?.volumeRatio !== undefined && (
        <div className={css.foot}>量比 {hits[0].volumeRatio.toFixed(2)}</div>
      )}
    </div>
  )
}

/** mcp__mommy-chaogu__run_backtest：回测结果卡（探索性评估，caveats 前置）。 */
export function BacktestCard(props: CardProps) {
  const call = readCall((props.block ?? {}) as ToolCallBlock)
  if (call.resultText === null) return null
  const view = parseBacktest(call.resultText)
  if (view === null) return null
  const t = props.t
  return (
    <div className={css.card} data-mommy-card="backtest">
      <Head title={t?.('card.backtest.title') ?? '信号回放'} />
      <Grid
        rows={[
          [t?.('card.backtest.signals') ?? '信号数', String(view.totalSignals)],
          [t?.('card.backtest.winRate') ?? '胜率', `${(view.winRate * 100).toFixed(1)}%`],
          [t?.('card.backtest.avgReturn') ?? '平均净收益', fmtPct(view.avgReturnPct)],
          [t?.('card.backtest.drawdown') ?? '最大回撤', fmtPct(view.maxDrawdownPct)],
          ['Sharpe', view.sharpeRatio.toFixed(2)],
          [
            t?.('card.backtest.hold') ?? '持有',
            view.holdDays !== null ? `${view.holdDays}d` : '—',
          ],
        ]}
      />
      {view.caveats.length > 0 && (
        <div className={css.foot}>
          ⚠ {t?.('card.backtest.caveats') ?? '探索性评估'}：{view.caveats.join('；')}
        </div>
      )}
      {view.message !== '' && <div className={css.foot}>{view.message}</div>}
      {view.costModel !== '' && <div className={css.foot}>{view.costModel}</div>}
    </div>
  )
}

/** mcp__mommy-chaogu__get_money_flow_history：历史资金流趋势卡（主力净流入时序）。 */
export function FlowHistoryCard(props: CardProps) {
  const call = readCall((props.block ?? {}) as ToolCallBlock)
  if (call.resultText === null) return null
  const flows = parseFlowHistory(call.resultText)
  if (flows.length === 0) return null
  const t = props.t
  const max = Math.max(...flows.map(f => Math.abs(f.mainNet)), 1)
  return (
    <div className={css.card} data-mommy-card="flow-history">
      <Head title={`${t?.('card.flowHistory.title') ?? '历史资金流'} · ${flows[0]?.name ?? ''}`} />
      <div className={css.list}>
        {flows
          .slice()
          .reverse()
          .map(f => (
            <div key={`${f.code}-${f.timestamp}`} className={css.barsBar}>
              <span className={`${css.k} ${css.dim}`} style={{ minWidth: 74, fontSize: 11 }}>
                {f.timestamp?.slice(5, 10) ?? '—'}
              </span>
              <span className={`${css.trend} ${css.barsBar}`} data-trend={trendOf(f.mainNet)}>
                <span className={css.barSeg} style={{ width: `${Math.max((Math.abs(f.mainNet) / max) * 110, 2)}px` }} />
              </span>
              <span className={`${css.num} ${css.trend}`} data-trend={trendOf(f.mainNet)}>
                {fmtAmountCN(f.mainNet)}
              </span>
            </div>
          ))}
      </div>
    </div>
  )
}

/** mcp__mommy-chaogu__screen_inflow_stocks：主力净流入筛选卡。 */
export function ScreenInflowCard(props: CardProps) {
  const call = readCall((props.block ?? {}) as ToolCallBlock)
  if (call.resultText === null) return null
  const { rows, total } = parseScreenInflow(call.resultText)
  if (rows.length === 0) return null
  const t = props.t
  return (
    <div className={css.card} data-mommy-card="screen-inflow">
      <Head title={`${t?.('card.screenInflow.title') ?? '主力净流入筛选'} · ${rows.length}/${total}`} />
      <table className={css.table}>
        <thead>
          <tr>
            <th>{t?.('dock.title') ?? '标的'}</th>
            <th>{t?.('card.flow.mainNet') ?? '主力净流入'}</th>
            <th>bp</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.code}>
              <td>
                {r.name} <span className={css.dim}>{r.code}</span>
              </td>
              <td>
                <Trend value={r.mainNet}>{fmtAmountCN(r.mainNet)}</Trend>
              </td>
              <td>{r.ratioBp !== null ? r.ratioBp.toFixed(0) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** mcp__mommy-chaogu__search_similar_events：相似历史事件检索卡。 */
export function SimilarEventsCard(props: CardProps) {
  const call = readCall((props.block ?? {}) as ToolCallBlock)
  if (call.resultText === null) return null
  const events = parseSimilarEvents(call.resultText)
  if (events.length === 0) return null
  const t = props.t
  return (
    <div className={css.card} data-mommy-card="similar-events">
      <Head title={`${t?.('card.similarEvents.title') ?? '相似历史事件'} · ${events.length}`} />
      <div className={css.list}>
        {events.map(e => (
          <div key={e.id ?? e.summary} className={css.listItem}>
            <div className={css.head}>
              {e.scope !== null && <span className={css.badge}>{e.scope}</span>}
              {e.score !== null && <span className={`${css.dim} ${css.num}`}>{e.score.toFixed(3)}</span>}
              {e.timestamp !== null && <span className={css.foot}>{e.timestamp.slice(0, 10)}</span>}
            </div>
            <span>{e.summary}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** mcp__mommy-chaogu__record_research_conclusion：研究结论写入回执卡。 */
export function RecordConclusionCard(props: CardProps) {
  const call = readCall((props.block ?? {}) as ToolCallBlock)
  if (call.resultText === null) return null
  const view = parseRecordConclusion(call.resultText)
  if (view === null) return null
  const t = props.t
  const stateLabel =
    view.state === 'saved'
      ? (t?.('card.recordConclusion.saved') ?? '已写入记忆')
      : view.state === 'confirmation_required'
        ? (t?.('card.recordConclusion.needsConfirm') ?? '待用户确认')
        : (t?.('card.recordConclusion.skipped') ?? '按请求跳过')
  return (
    <div className={css.card} data-mommy-card="record-conclusion" data-state={view.state}>
      <div className={css.head}>
        <span className={css.title}>{t?.('card.recordConclusion.title') ?? '研究结论'}</span>
        <span className={css.badge} data-state={view.state === 'saved' ? 'ok' : 'error'}>
          {stateLabel}
        </span>
      </div>
      {view.message !== '' && <div className={css.foot}>{view.message}</div>}
    </div>
  )
}
