"""quote command family：批量报价 JSON 数据面。

输出形状与 agent 工具 ``get_quotes`` 的结果一致（同一 ``_quote_to_dict``
序列化），供 DSH 桥（dsh-bundle node 半）和脚本消费——CLI 是工具箱的稳定
契约面，浏览器停靠面板不直接碰 Python 内部 API。
"""

from __future__ import annotations

import argparse
import json
import logging
import sys

_log = logging.getLogger(__name__)

#: 与 agent 工具 get_quotes 相同的批量上限
MAX_QUOTE_CODES = 50


def cmd_quote(args: argparse.Namespace) -> int:
    from mommy_chaogu.agent.tools.base import _quote_to_dict
    from mommy_chaogu.market_data import create_adapter_chain

    codes = [code.strip() for code in args.codes if code.strip()]
    if not codes:
        print("至少提供一个股票代码", file=sys.stderr)
        return 2
    if len(codes) > MAX_QUOTE_CODES:
        print(f"一次最多 {MAX_QUOTE_CODES} 只（当前 {len(codes)}）", file=sys.stderr)
        return 2

    adapter = create_adapter_chain()
    try:
        quotes = adapter.get_quotes(codes)
    except Exception as e:  # 拉新失败：输出结构化错误，调用方决定降级
        _log.debug("批量报价失败: %s", e)
        print(json.dumps({"source": "", "quotes": [], "error": str(e)}, ensure_ascii=False))
        return 0
    label = ""
    if hasattr(adapter, "format_source_label"):
        label = str(adapter.format_source_label())
    payload = {"source": label, "quotes": [_quote_to_dict(q) for q in quotes]}
    print(json.dumps(payload, ensure_ascii=False))
    return 0


def build_quote_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="mommy-quote",
        description="妈妈炒股 - 批量实时报价（JSON 输出）",
        epilog=("example:\n  mommy quote 600519 000001\n  mommy quote 600519 AAPL ^GSPC"),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument(
        "codes",
        nargs="+",
        help=f"股票代码（A 股 6 位数字 / 美股字母 / ^GSPC 等指数），最多 {MAX_QUOTE_CODES} 个",
    )
    p.set_defaults(func=cmd_quote)
    return p


def main_quote(argv: list[str] | None = None) -> int:
    parser = build_quote_parser()
    args = parser.parse_args(argv)
    rc = args.func(args)
    return int(rc) if rc is not None else 0


if __name__ == "__main__":
    raise SystemExit(main_quote())
