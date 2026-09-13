import { describe, expect, it } from 'vitest'
import {
  fmtAmountCN,
  parseBars,
  parseFlows,
  parseIndexes,
  parsePredictions,
  parseQuote,
  parseQuotes,
  coerceQuote,
  parseWatchlistOp,
  readCall,
  trendOf,
} from '../src/client/parse.ts'

const QUOTE = JSON.stringify({
  code: '600519',
  name: '贵州茅台',
  price: 1520.5,
  change_pct: 1.23,
  change: 18.5,
  open: 1502.0,
  high: 1530.0,
  low: 1500.0,
  prev_close: 1502.0,
  volume: 2100000,
  turnover: 3193050000,
  turnover_rate: 0.17,
  volume_ratio: 1.1,
  pe: 25.4,
  total_market_cap: 1909000000000,
  circulating_market_cap: 1909000000000,
  timestamp: '2026-09-11T15:00:00+08:00',
})

describe('parseQuote / parseQuotes（get_quote / get_quotes 形状）', () => {
  it('完整报价解析', () => {
    const view = parseQuote(QUOTE)
    expect(view?.code).toBe('600519')
    expect(view?.changePct).toBe(1.23)
    expect(view?.totalMarketCap).toBe(1.909e12)
  })
  it('{error} 载荷返回 null（卡片回落官方工具行）', () => {
    expect(parseQuote(JSON.stringify({ error: '未找到股票 000000 的行情' }))).toBeNull()
  })
  it('批量报价数组', () => {
    const views = parseQuotes(`[${QUOTE},${QUOTE}]`)
    expect(views).toHaveLength(2)
    expect(parseQuotes('{"error":1}')).toEqual([])
  })
})

describe('parseIndexes（get_market_indexes 形状）', () => {
  it('指数数组解析', () => {
    const views = parseIndexes(
      JSON.stringify([
        { code: '000001', name: '上证指数', price: 3200.1, change_pct: 0.5, prev_close: 3184.2 },
      ]),
    )
    expect(views[0]?.name).toBe('上证指数')
  })
})

describe('parseFlows（get_money_flow_today 单只与批量形状）', () => {
  const flow = {
    code: '600519',
    name: '贵州茅台',
    timestamp: '2026-09-11T15:00:00+08:00',
    main_net: 250000000,
    super_large_net: 300000000,
    large_net: -50000000,
    medium_net: -100000000,
    small_net: -150000000,
    main_net_ratio: 5.2,
  }
  it('单只流对象', () => {
    const views = parseFlows(JSON.stringify(flow))
    expect(views).toHaveLength(1)
    expect(views[0]?.mainNet).toBe(2.5e8)
  })
  it('批量 {results: {code: 流}}', () => {
    const views = parseFlows(JSON.stringify({ results: { '600519': flow }, count: 1 }))
    expect(views).toHaveLength(1)
    expect(views[0]?.superLargeNet).toBe(3e8)
  })
  it('{error} 返回空', () => {
    expect(parseFlows(JSON.stringify({ error: 'x' }))).toEqual([])
  })
})

describe('parseBars（get_bars 形状，旧→新输入）', () => {
  it('K 线数组解析且保留原顺序', () => {
    const bars = [
      { code: '600519', name: '贵州茅台', timestamp: '2026-09-10T15:00:00+08:00', open: 1, high: 2, low: 0.5, close: 1.5, volume: 100, turnover: 150, change_pct: null },
      { code: '600519', name: '贵州茅台', timestamp: '2026-09-11T15:00:00+08:00', open: 1.5, high: 2.5, low: 1.4, close: 2.4, volume: 120, turnover: 280, change_pct: 60 },
    ]
    const parsed = parseBars(JSON.stringify(bars))
    expect(parsed?.code).toBe('600519')
    expect(parsed?.bars).toHaveLength(2)
    expect(parsed?.bars[1]?.changePct).toBe(60)
  })
  it('空数组返回 null', () => {
    expect(parseBars('[]')).toBeNull()
    expect(parseBars('{"error":1}')).toBeNull()
  })
})

describe('parsePredictions（get_prediction_history 形状）', () => {
  it('预测记录数组', () => {
    const views = parsePredictions(
      JSON.stringify([
        { id: 'p1', code: '600519', name: '贵州茅台', prediction: '看涨到 1600', direction: 'up', status: 'pending', score: null, created_at: '2026-09-01', verified_at: null },
      ]),
    )
    expect(views[0]?.direction).toBe('up')
  })
})

describe('parseWatchlistOp（manage_watchlist 回执三态）', () => {
  const args = JSON.stringify({ action: 'add', code: '600519', group: '白酒' })
  it('成功回执 → ok', () => {
    expect(parseWatchlistOp(args, JSON.stringify({ ok: true }), false)?.state).toBe('ok')
  })
  it('拒绝回执（用户拒绝了该操作）→ denied', () => {
    const view = parseWatchlistOp(args, JSON.stringify({ error: '用户拒绝了该操作' }), false)
    expect(view?.state).toBe('denied')
  })
  it('其他 error → error', () => {
    expect(parseWatchlistOp(args, JSON.stringify({ error: '分组不存在' }), true)?.state).toBe('error')
  })
  it('args 缺 code → null', () => {
    expect(parseWatchlistOp(JSON.stringify({ action: 'add' }), '{}', false)).toBeNull()
  })
})

describe('readCall / 格式化', () => {
  it('tool-result 块读取 argsRaw 与文本', () => {
    const call = readCall({
      kind: 'tool-result',
      call: { argsRaw: '{"code":"600519"}' },
      content: [{ text: '{"price":1}' }],
      isError: false,
    })
    expect(call.argsRaw).toBe('{"code":"600519"}')
    expect(call.resultText).toBe('{"price":1}')
  })
  it('running 块 → resultText null', () => {
    expect(readCall({ kind: 'tool-call', argsRaw: '{}' }).resultText).toBeNull()
  })
  it('万/亿格式化与 A 股趋势语义（涨红跌绿）', () => {
    expect(fmtAmountCN(2.5e8)).toBe('2.50亿')
    expect(fmtAmountCN(1.2e12)).toBe('1.20万亿')
    expect(fmtAmountCN(null)).toBe('—')
    expect(trendOf(1)).toBe('up')
    expect(trendOf(-1)).toBe('down')
    expect(trendOf(0)).toBe('flat')
  })
})

describe('coerceQuote（桥原始字典 → 视图模型；dock 崩溃回归）', () => {
  it('snake_case 字典转 camelCase 视图模型', () => {
    const view = coerceQuote({ code: '600519', name: '贵州茅台', price: 1275.16, change_pct: -0.78 })
    expect(view?.changePct).toBe(-0.78)
    expect(view?.prevClose).toBeNull()
  })
  it('字段缺失 / price 非数值 → null（dock 不再渲染 undefined.toFixed 崩溃）', () => {
    expect(coerceQuote({ code: '600519' })).toBeNull()
    expect(coerceQuote({ code: '600519', price: 'NaN' })).toBeNull()
    expect(coerceQuote(null)).toBeNull()
  })
})
