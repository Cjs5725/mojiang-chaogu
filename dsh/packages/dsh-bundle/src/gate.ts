/**
 * mommy-chaogu-gate —— 写操作审批闸门（嫁接面 3）。
 *
 * mommy 的 7 个写工具经 MCP 行以 `mcp__mommy-chaogu__<rawName>` 暴露；判定语义
 * 逐条移植自 Python 侧 `agent/service.py` 的 requires_confirmation 白名单：
 * strategy_* 三件套恒确认；manage_watchlist / manage_alert 仅 add/remove
 * 动作确认（list 等查询动作不打扰）。挂 `tools/pre-execute` waterfall，
 * 命中返回 `{kind:'ask'}` 交宿主审批层——永不直接 allow（要么 ask 要么
 * next()）；headless 宿主无审批者时 ask 被宿主自动降级 deny（fail-closed
 * 白送，core/tools serviceAsk 语义）。
 */
import Schema from '@deepseek-ai/schemastery'
import type { GateListener, HostContext, PreToolDecision } from './types.ts'

/** Cordis 插件名 = patch 行 id。 */
export const name = 'mommy-chaogu-gate'

export interface Config {
  /** 闸门开关；false 时完全不挂监听器（仅测试/显式降级用）。 */
  enabled: boolean
}

export const Config: Schema<Config> = Schema.object({
  enabled: Schema.boolean().default(true),
})

/** MCP serverName（与 patch 行 mommy-chaogu-mcp 的 config.serverName 一致）。 */
export const MCP_TOOL_PREFIX = 'mcp__mommy-chaogu__'

/** 恒确认：策略卡三件套（保存/归档/启用监控是三次独立授权，见产品文档）。 */
export const CONFIRM_ALWAYS: ReadonlySet<string> = new Set([
  'strategy_save',
  'strategy_archive',
  'strategy_activate_monitor',
])

/** 按动作确认：manage_* 的 add/remove 是写，list 等动作是读。 */
export const CONFIRM_BY_ACTION: Readonly<Record<string, ReadonlySet<string>>> = {
  manage_alert: new Set(['add', 'remove']),
  manage_watchlist: new Set(['add', 'remove']),
}

/** 与 Python 侧 requires_confirmation(fn_name, fn_args) 同语义的纯判定。 */
export function requiresConfirmation(rawToolName: string, args: unknown): boolean {
  const actions = CONFIRM_BY_ACTION[rawToolName]
  if (actions !== undefined) {
    const action = (args as { action?: unknown } | null | undefined)?.action
    return typeof action === 'string' && actions.has(action.toLowerCase())
  }
  return CONFIRM_ALWAYS.has(rawToolName)
}

/**
 * 纯判定：这次工具调用是否需要用户审批。
 *
 * 非 mommy 工具或只读调用 → undefined（调用方必须 next()）；写调用 →
 * `{kind:'ask'}`。参数形状不信任（工具自校验 schema，闸门只做保守读取）。
 */
export function decideWriteGate(
  toolName: string,
  args: unknown,
  prefix: string = MCP_TOOL_PREFIX,
): PreToolDecision | undefined {
  if (!toolName.startsWith(prefix)) return undefined
  const rawName = toolName.slice(prefix.length)
  if (!requiresConfirmation(rawName, args)) return undefined
  return {
    kind: 'ask',
    reason:
      `mommy tool "${toolName}" modifies user data (watchlist / alerts / strategy cards); `
      + 'the mommy-chaogu gate requires explicit user approval. '
      + 'Headless deployments with no approver will deny this call — fail closed by design.',
  }
}

/** waterfall 监听器工厂（独立导出便于单测直接驱动 next() 契约）。 */
export function createGateListener(prefix: string = MCP_TOOL_PREFIX): GateListener {
  return async (exec, next) => decideWriteGate(exec.name, exec.arguments, prefix) ?? next()
}

/** 插件入口：挂统一审批监听器（不声明 inject——事件面无需服务）。 */
export function apply(ctx: HostContext, config: Config = { enabled: true }): void {
  if (config.enabled === false) return
  ctx.on('tools/pre-execute', createGateListener())
}
