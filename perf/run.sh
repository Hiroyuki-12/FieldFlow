#!/usr/bin/env bash
set -euo pipefail

scenario="${1:-}"
case "$scenario" in
  smoke|checklist|master|all) ;;
  *)
    echo "Usage: bash perf/run.sh {smoke|checklist|master|all}" >&2
    exit 2
    ;;
esac

script_directory="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
results_directory="$script_directory/results"
mkdir -p "$results_directory"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"

# ローカルだけGit追跡外の設定を読み、CIから注入された環境ではファイルへ依存しない。
if [[ -f "$script_directory/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$script_directory/.env"
  set +a
fi

run_scenario() {
  local name="$1"
  echo "Running performance scenario '$name' against ${PERF_BASE_URL:-http://localhost:8080}"
  PERF_SUMMARY_PATH="$results_directory/${timestamp}-${name}.json" \
    K6_NO_USAGE_REPORT=true k6 run \
    "$script_directory/scenarios/${name}.ts"
}

if [[ "$scenario" == "all" ]]; then
  run_scenario smoke
  run_scenario checklist
  run_scenario master
else
  run_scenario "$scenario"
fi
