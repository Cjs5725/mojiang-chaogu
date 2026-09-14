# DSH 嫁接前端回归清单（给会操作前端的 Agent 执行）

> 用途：**修复批次回归**（2026-09-13 CHANGELOG「Unreleased」所列修复）的真机验证。
> 执行者假设：能用浏览器/无头 Chrome 打开页面、截图、读 DOM、发消息、跑 shell 命令。
> 与 `dsh/TEST-PLAYBOOK.md` 的关系：环境启动手法、IAB 自动化坑（§4）、异常登记表
> （§6 A1–A11/H1–H3）全部沿用本文引用处；本清单只覆盖**新修复的回归面**，用例编号 F1–F8。
>
> 纪律：黑盒操作为主（真实点击/输入，不 JS 注入点击对话与按钮；布局类用例允许
> localStorage/DOM 读取作为环境准备与证据）；每条用例截图归档，命名见各条。

## 0. 判定总则

- 每条用例三态：✅ 通过 / ❌ 失败 / ⏸ 受阻（环境原因，写明卡在哪一步）。
- 任何「看似成功但证据缺失」记 ⏸，不猜。
- 时间语义：A 股交易时段（9:30–15:00 工作日）来源脚注期望「实时」；非交易时段
  允许「本地缓存（拉新失败，可能过期）」——**非空即可**，两种都算通过。
- 遇到会话吞话题（playbook A7）：每条对话用例开新会话，或提示词前缀「新话题，与之前无关：」。
- 合成点击对部分宿主按钮无效（playbook H2）：点击无响应时重试一次，仍无响应记 ⏸ 并截图，
  不用 JS click 硬撬；本文涉及点击的用例都给了 localStorage 替代路径。

## 1. 隔离环境（从零开始，约 3 分钟）

用 scratch 数据目录，不碰真实 `data/portfolio.db`；空自选股是 F1 的前置条件。

```bash
cd /Users/hanyan/CoffeeMan/mommy-chaogu

# 1.1 门禁全绿（这是本批修复的一部分：typecheck 刚进门禁）
pnpm -C dsh build && pnpm -C dsh typecheck && pnpm -C dsh test   # 期望：构建成功 + 65/65
uv run pytest tests/test_dsh_adapter.py tests/test_dsh_product.py \
   tests/test_dsh_four_star_tools.py tests/test_mcp_idle_watchdog.py -q   # 期望全过

# 1.2 scratch 安装（personal 档：F5 写操作需要；空库：F1 需要）
export MOMMY_DATA_DIR=/tmp/mommy-dsh-test-$(date +%s)
uv run mommy dsh install --personal
uv run mommy dsh doctor
```

**G0 预检判定**（doctor 输出逐行核对）：

| 检查 | 期望 |
|---|---|
| dsh_binary | ⚠️ 警告可接受（npx 形态，本机常态） |
| 其余各项 | 全 ✅ |
| product_skills 文案 | **「5 个产品 Skill 就位。」**（动态计数；出现「三个」即回归） |
| 结论 | 「产品 profile 可用」 |

```bash
# 1.3 数据面预检（bridge 依赖的 CLI 契约）
uv run mommy quote 600519
```

**G0b 判定**：输出 JSON 的 `"source"` **非空字符串**（实时/缓存皆可）。恒为 `""` 即
F4 相关回归（quote 未走缓存层）。

```bash
# 1.4 启动宿主（复用 playbook §2 手法；--no-open 不拉系统浏览器）
export ZAI_API_KEY=$(grep -E "^ZAI_API_KEY=" .env | cut -d= -f2 | tr -d '"')
pkill -f "dsh --profile mommy"; pkill -f mommy_chaogu.agent.mcp_server
DSH_HOME=$MOMMY_DATA_DIR/dsh-home nohup npx -y @deepseek-ai/dsh@0.1.5-rc.2 \
  --profile mommy --no-open > /tmp/dsh-host.log 2>&1 &
sleep 10 && grep -E "dsh web:|MCP server started" /tmp/dsh-host.log
```

入口 = 日志里 `http://127.0.0.1:3080/?token=<token>`。进入后：关 Internal Testing
Notice → 工作区选默认 → agent 模式选「mommy 投研助手」。

**G1 会话探针**（playbook §3，一票否决）：新会话发 `查一下 600519 的最新价格`，回答
出现后执行 `grep -c CallToolRequest /tmp/dsh-host.log` ≥1。为 0 → 按 A11 处理：重启宿主
+ 全新会话重试，三次仍 0 则本清单记 ⏸ 环境受阻。

## 2. 用例 F1–F8

### F1 空自选股状态有刷新按钮（修复：空态丢按钮）
- 前置：scratch 空库（§1.2 保证），dock 已渲染。
- 操作：观察 dock 空态；点一次「刷新」按钮。
- 预期：标题栏有 **刷新** 按钮（与「–」收起按钮并列）；点击后按钮短暂变「加载中…」
  并完成一轮加载，无报错；空态文案「自选股为空」+ 引导语仍在。
- 失败指向：dock.tsx 空态分支回归。
- 证据：`f1_empty_refresh.png`（点击前）、`f1_empty_refresh_clicked.png`。

### F2 挂载即收起后布局跟踪正常（修复：collapsed 挂载 observer 缺失）
- 前置：dock 正常展开。**不需要点击收起按钮**（IAB 可能点不动，H2），直接：
  控制台执行 `localStorage.setItem('mommy.dock.v1', JSON.stringify({pos:null, collapsed:true}))`
  → 刷新页面。
- 操作：① 刷新后应见左侧药丸（「自选 · N」）；② 点药丸展开（点击无响应则控制台
  `localStorage.setItem('mommy.dock.v1', JSON.stringify({pos:null, collapsed:false}))` 再刷新，
  在报告里注明走了哪条路径）；③ **不刷新页面**，立即读
  `document.querySelector('[data-mommy-dock]').getBoundingClientRect().left` 和宿主侧栏宽度
  （frame 元素 `style.gridTemplateColumns` 第一列像素值）。
- 预期：药丸可见；展开后面板 **left ≥ 侧栏宽度**（面板贴侧栏右缘，不压盖）；随后拖宽
  宿主侧栏，面板 left 立即跟随（衔接 F3）。
- 失败指向：left ≈ 8px / 面板压在侧栏下 = observer 未安装（回归）；正常应 ≈ 侧栏宽 + 8。
- 证据：`f2_pill.png`、`f2_expanded_position.png`（截图需含侧栏与面板同框）。

### F3 侧栏拖宽/收起实时跟随（MutationObserver）
- 操作：拖宿主侧栏分隔条加宽 ~100px → 再收起宿主侧栏（若有收起钮）。
- 预期：两种操作后面板/药丸 left 都即时移动，始终不遮挡侧栏、不出视口右缘。
- 失败指向：面板不动 = observer 失效；出视口 = clamp 回归。
- 证据：`f3_sidebar_wide.png`、`f3_sidebar_collapsed.png`。

### F4 来源脚注非空（修复：quote source 恒空）
- 操作：确保自选有票（没有就先做 F5 的 add）；看 dock 底部「来源」行；再发
  `查一下 600519 的最新价格` 看报价卡片。
- 预期：dock 来源行**非空**（「东方财富 实时」/「腾讯财经 实时」/「本地缓存…」任一）；
  报价卡片同样有来源信息。
- 失败指向：恒空 = CLI/缓存层链路回归（对照 G0b 结果区分前端 or 数据面）。
- 证据：`f4_source_label.png`。

### F5 AI 写自选 → 审批 → dock 自动更新（WAL/SSE 失效链路，本批核心）
- 前置：personal 档（§1.2 已装）。开**新会话**。
- 操作：发 `把 600519 加进我的自选股，分组"测试"`。
- 预期（按序核对四点）：
  1. 出现宿主审批条（Waiting for approval / Allow…），**不是**直接执行；
  2. 点 **Allow once**；
  3. **不手动刷新 dock**，≤5 秒内 dock 出现 600519（SSE 失效信号 + WAL mtime 修复的
     端到端验证——AI 写发生在 MCP 子进程，主 db 文件 mtime 在 checkpoint 前不动）；
  4. 来源/计数更新正确。
- 分支 B（拒绝路径）：再发 `把 000001 加进自选`，审批选 **Deny** → 回答含
  「用户拒绝/已取消」类表述，dock 不出现 000001。
- 失败指向：需手动刷新才出现 = WAL/SSE 失效链路回归；无审批条直接执行 = 闸门回归（严重）。
- 证据：`f5_approval.png`、`f5_dock_updated.png`、`f5_denied.png`。

### F6 宽窗口金叉不死区（修复：slow≥119 静默空结果）
- 操作：新会话发
  `用 check_kline_signal 的均线金叉模式看 600519，fast=5、slow=250，只要结论`
- 预期：工具真实以 slow=250 调用（回答里出现 250 日窗口表述）；结果三选一且都有明确
  表述：**命中**（给数字）/ **0 命中** / **历史不足**（提到 skipped/数据不够）。
  绝不允许：静默「没有信号」且没有任何窗口说明（旧缺陷形态）。
- 说明：600519 历史充足，预期命中或 0 命中；「历史不足」路径用 `slow=250` 查一只
  上市不久的票可选做。
- 证据：`f6_kline_250.png`。

### F7 卡片抽查（四星前端不回归）
- 操作：新会话依次发：
  `用 get_bars 查 600519 最近 40 根日K，带 5 日和 20 日均线`（BarsCard：MA 列有值，
  尾部行 MA20 非空——40 根窗口 MA20 前 19 行为「—」属正常）；
  `看看 600519 有没有放量上涨信号`（KlineSignalCard 或 0 命中诚实表述）。
- 预期：富卡片渲染（表格/信号卡），不是纯文本工具行；MA 数值与收盘价量级吻合；
  无法计算的均线显示「—」而非编数。
- 证据：`f7_bars_ma.png`、`f7_signal.png`。

### F8 拖拽 + 双击复位（playbook T6 复测）
- 操作：拖 dock 标题栏到屏幕中部 → 刷新页面（位置持久化）→ 双击标题栏复位。
- 预期：拖动跟手；刷新后位置保持；双击后面板回到贴侧栏默认位。
- 证据：`f8_dragged.png`、`f8_reset.png`。

## 3. 结果登记（照抄进报告）

| 用例 | 结果 | 证据文件 | 备注/偏差 |
|---|---|---|---|
| G0 doctor 预检 | | — | |
| G0b quote source 非空 | | — | |
| G1 MCP 探针 ≥1 | | — | |
| F1 空态刷新按钮 | | | |
| F2 collapsed 挂载布局 | | | left=__px，侧栏=__px |
| F3 侧栏跟随 | | | |
| F4 来源脚注 | | | 实测文案：__ |
| F5 写→审批→自动更新 | | | 更新耗时__s |
| F5b 拒绝路径 | | | |
| F6 slow=250 | | | 命中/0命中/历史不足：__ |
| F7 卡片抽查 | | | |
| F8 拖拽/复位 | | | |

新异常沿用 playbook §6 编号规则（续 A12…/H4…），登记：现象 / 复现步骤 / 根因猜测 / 严重度。

## 4. 收尾

```bash
pkill -f "dsh --profile mommy"; pkill -f mommy_chaogu.agent.mcp_server
mkdir -p gui-test-screenshots && mv /tmp/f*.png gui-test-screenshots/ 2>/dev/null
rm -rf $MOMMY_DATA_DIR   # scratch 数据目录整体清除
```

报告落 `reports/`（命名 `YYYY-MM-DD-dsh-frontend-regression.md`）：结果表 + 新异常登记 +
本清单版本（引用 CHANGELOG「Unreleased」修复批次）。
