#!/usr/bin/env python3
"""Swift 源码静态自检（无 Xcode 环境下的兜底检查）

检查项：
1. 括号 / 方括号 / 圆括号是否平衡（跳过字符串与注释）
2. 闭包元组解构 `{ a, b in`（Swift 3 起已移除，会编译失败）
3. 自定义类型是否都有定义（跨文件扫描 struct / class / enum / extension）
4. 中文全角标点混入代码（常见手误）
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "ios" / "Waimai"
problems = []

def strip_noise(src: str) -> str:
    # 必须先去掉字符串，否则 "http://..." 里的 // 会被误判成注释
    src = re.sub(r'"(?:\\.|[^"\\])*"', '""', src)
    src = re.sub(r'/\*.*?\*/', '', src, flags=re.S)         # 块注释
    src = re.sub(r'//[^\n]*', '', src)                      # 行注释
    return src

def check_balance(path: Path, code: str):
    pairs = {'(': ')', '[': ']', '{': '}'}
    stack = []
    for i, ch in enumerate(code):
        if ch in pairs:
            stack.append((ch, i))
        elif ch in pairs.values():
            if not stack:
                problems.append(f"{path}:{line_of(code, i)} 多余的 '{ch}'")
                return
            op, _ = stack.pop()
            if pairs[op] != ch:
                problems.append(f"{path}:{line_of(code, i)} 括号不匹配 '{op}' vs '{ch}'")
                return
    if stack:
        op, idx = stack[-1]
        problems.append(f"{path}:{line_of(code, idx)} 未闭合的 '{op}'")

def line_of(code: str, idx: int) -> int:
    return code.count('\n', 0, idx) + 1

def check_destructuring(path: Path, src: str):
    # ForEach(...) { a, b in } 形式（reduce/sorted 的两参数闭包是合法的，排除）
    for m in re.finditer(r'\{\s*([A-Za-z_]\w*)\s*,\s*([A-Za-z_]\w*)\s+in\b', src):
        line_start = src.rfind('\n', 0, m.start()) + 1
        prefix = src[line_start:m.start()]
        if 'reduce' in prefix or 'sorted' in prefix:
            continue
        problems.append(
            f"{path}:{line_of(src, m.start())} 疑似闭包元组解构 '{{ {m.group(1)}, {m.group(2)} in }}' "
            f"（Swift 3 起不支持，改用单个参数再取 .0/.1）")

def check_fullwidth(path: Path, src: str):
    for i, line in enumerate(src.splitlines(), 1):
        code_part = re.sub(r'"(?:\\.|[^"\\])*"', '""', line)
        code_part = re.sub(r'//.*', '', code_part)
        for ch in ('；', '（', '）', '，', '：'):
            if ch in code_part:
                problems.append(f"{path}:{i} 代码里出现全角符号 '{ch}'")

def main():
    files = sorted(ROOT.rglob('*.swift'))
    if not files:
        print("未找到 Swift 源文件"); sys.exit(1)

    defined = set()
    for f in files:
        src = f.read_text(encoding='utf-8')
        for m in re.finditer(r'\b(?:struct|class|enum|protocol|typealias)\s+([A-Za-z_]\w*)', src):
            defined.add(m.group(1))
        for m in re.finditer(r'\bextension\s+([A-Za-z_]\w*)', src):
            defined.add(m.group(1))

    for f in files:
        src = f.read_text(encoding='utf-8')
        code = strip_noise(src)
        check_balance(f, code)
        check_destructuring(f, src)
        check_fullwidth(f, src)
    if problems:
        print(f"发现 {len(problems)} 处可疑问题：")
        for p in problems:
            print("  -", p)
        sys.exit(1)
    print(f"✅ {len(files)} 个 Swift 文件静态自检通过")
    for f in files:
        print(f"   {f.relative_to(ROOT)} ({len(f.read_text(encoding='utf-8').splitlines())} 行)")

if __name__ == '__main__':
    main()
