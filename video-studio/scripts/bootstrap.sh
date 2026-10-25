#!/usr/bin/env bash
# ZUVYR Studio bootstrap: create the venv, install runtime deps, health-check.
# Usage:  bash scripts/bootstrap.sh && source .venv/bin/activate
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -d .venv ]; then
  echo "== creating .venv"
  python3 -m venv .venv
fi
echo "== installing requirements (PyPI only, no keys)"
.venv/bin/pip install --upgrade pip >/dev/null
.venv/bin/pip install -r requirements.txt
echo "== installing pytest for the test suite"
.venv/bin/pip install pytest

echo "== doctor"
.venv/bin/python bin/zuvyr doctor

cat <<'EOF'

Bootstrap complete. Try:
  .venv/bin/python bin/zuvyr generate --script scripts/samples/sample_60s.txt --format long
  .venv/bin/python bin/zuvyr portal --port 8787
  .venv/bin/python -m pytest tests/ -q
EOF
