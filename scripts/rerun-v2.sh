#!/bin/bash
# 2026-08-13 전량 재실행. 가드 버그 두 개(자치체 서브도메인·javascript: 버튼)를
# 고친 뒤의 코드로 전부 다시 잰다. 세대 이름은 batchv2__ (scripts/build-web-data.ts).
#
# ★ 사이트별로 **동시에** 돈다. 절대규칙 6은 「도메인당 동시성 1」이고 5개 미션은
#   전부 다른 도메인이므로, 한 도메인이 받는 부하는 순차일 때와 똑같다.
#   같은 도메인에 두 프로세스를 붙이지 말 것 — MISSIONS에 같은 사이트를 두 번 넣으면 깨진다.
#
# 시간 예산이 오염될 걱정은 실측으로 확인했다: 165런 중 시간 초과로 끝난 것은 1건,
# 실행 시간 중앙값 50초·최대 186초(예산 600초). 기계가 몇 배 느려져도 판정이 뒤집히지 않는다.
#
# 프로필 순서는 **공표 5종이 먼저**다. 도중에 죽어도 표가 성립하도록.
set -u
cd "$(dirname "$0")/.."

PROFILES="control,senior-70s,resident-n3,smartphone-novice,busy-worker,control-mobile,resident-n3-en"
VARIANTS=4
MISSIONS="shinjuku-tennyu minato-tennyu shibuya-tennyu hamamatsu-tennyu oizumi-tennyu"

mkdir -p agent/runs/_log
echo "=== 재실행 시작 $(date '+%F %T') — 5사이트 동시 ==="
echo "명단: $PROFILES × ${VARIANTS}회 × 5사이트 = 140런"

pids=""
for m in $MISSIONS; do
  L="agent/runs/_log/$m.log"
  echo "▶ $m → $L"
  npm run batch -- "$m" --profiles "$PROFILES" --variants "$VARIANTS" --tag v2 > "$L" 2>&1 &
  pids="$pids $!"
  sleep 5   # 브라우저 기동이 한꺼번에 겹치지 않게 조금 어긋나게 띄운다
done

for p in $pids; do wait "$p"; done
echo "=== 재실행 종료 $(date '+%F %T') ==="
