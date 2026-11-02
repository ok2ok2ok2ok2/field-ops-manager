# -*- coding: utf-8 -*-
"""
把 GOOGLE_SA_JSON、CAL_PEOPLE_MAP 加到 field-ops-manager 的 Vercel Production
版本: v1.1 / 2026-11-03
檔案: scripts/copy_calendar_env.py

用法:
  python scripts/copy_calendar_env.py                    兩個都從 website-monitor（LINE bot）複製
  python scripts/copy_calendar_env.py --sa-file 金鑰.json  GOOGLE_SA_JSON 改用下載的金鑰檔, CAL_PEOPLE_MAP 照樣複製

- 值只在暫存檔與 vercel 指令之間流動, 不印到畫面; 結束一定刪暫存檔
- field-ops 已有同名變數會先移除再加 (避免 add 失敗)
v1.1: Windows 主控台 cp950 印不出 ✓✗ 會整支崩 (改 OK/NG + reconfigure);
      website-monitor 的 GOOGLE_SA_JSON 是 Sensitive, env pull 拉回空字串〔坑·ok2⁴·2026-11-03〕
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = r"C:\claude"
SRC = os.path.join(ROOT, r"NAMES\website-monitor")
DST = os.path.join(ROOT, "雜項", "field-ops-manager")
NAMES = ["GOOGLE_SA_JSON", "CAL_PEOPLE_MAP"]
VERCEL = shutil.which("vercel") or shutil.which("vercel.cmd")


def run(args, cwd, stdin=None):
    r = subprocess.run([VERCEL, *args], cwd=cwd, input=stdin, capture_output=True,
                       text=True, encoding="utf-8", errors="replace")
    return r.returncode, (r.stdout or "") + (r.stderr or "")


def parse_env(path):
    out = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            if "=" not in line or line.lstrip().startswith("#"):
                continue
            k, v = line.rstrip("\n").split("=", 1)
            if len(v) >= 2 and v[0] == '"' and v[-1] == '"':
                v = json.loads(v)
            out[k] = v
    return out


def add(name, value):
    run(["env", "rm", name, "production", "--yes"], DST)
    code, msg = run(["env", "add", name, "production"], DST, stdin=value)
    tail = "" if code == 0 else "\n" + msg[-300:]
    print(f"{'OK' if code == 0 else 'NG'} {name}: {len(value)} 字元{tail}")


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if not VERCEL:
        sys.exit("找不到 vercel 指令")

    sa_file = sys.argv[sys.argv.index("--sa-file") + 1] if "--sa-file" in sys.argv else None
    if sa_file:
        with open(sa_file, encoding="utf-8") as f:
            v = f.read().strip()
        sa = json.loads(v)  # 不是合法 JSON 就直接報錯, 不寫進去
        if not sa.get("client_email") or not sa.get("private_key"):
            sys.exit("這個檔案不是服務帳戶金鑰 (缺 client_email / private_key)")
        add("GOOGLE_SA_JSON", v)

    fd, tmp = tempfile.mkstemp(suffix=".env")
    os.close(fd)
    try:
        code, msg = run(["env", "pull", tmp, "--environment=production", "--yes"], SRC)
        if code:
            sys.exit("從 website-monitor 拉變數失敗:\n" + msg[-500:])
        env = parse_env(tmp)
        for n in NAMES:
            if n == "GOOGLE_SA_JSON" and sa_file:
                continue
            v = env.get(n, "")
            if not v:
                print(f"NG {n}: website-monitor 拉下來是空的 (Sensitive 類型拉不出值)")
                continue
            add(n, v)
    finally:
        os.remove(tmp)
        print("暫存檔已刪除" if not os.path.exists(tmp) else "注意: 暫存檔沒刪掉 " + tmp)


if __name__ == "__main__":
    main()
