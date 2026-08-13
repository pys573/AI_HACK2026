#!/bin/bash
# 재실행 보충분. 2026-08-13, 140런 중 58런까지 돌고 프로세스가 죽어서 나머지를 채운다.
#
# 이미 끝난 58런은 **버리지 않는다.** 같은 코드(가드 수정 후)에서 나왔고, 집계는
# mission_id로 합치므로 한 사이트에 배치가 여러 개 있어도 한 막대로 모인다
# (scripts/build-web-data.ts). 그래서 부족한 칸만 4회까지 채우면 된다.
#
# ⚠️ 한 배치에 1런만 들어가면 집계가 통째로 버린다 (`run_ids.length <= 1` — 중단된
#    배치를 걸러내는 장치다). 그래서 渋谷区 control만 1회가 아니라 2회 돌린다.
#    그 칸만 n=5가 되는데, 숫자는 칸별 n을 그대로 적으므로 숨길 것이 없다.
#
# 사이트끼리는 동시, 사이트 안에서는 순차 — 도메인당 동시성 1 (절대규칙 6).
set -u
cd "$(dirname "$0")/.."
mkdir -p agent/runs/_log

run() {  # run <mission> <profiles> <variants>
  npm run batch -- "$1" --profiles "$2" --variants "$3" --tag v2 >> "agent/runs/_log/$1.log" 2>&1
}

fill_hamamatsu() {
  run hamamatsu-tennyu "resident-n3,smartphone-novice,busy-worker,control-mobile,resident-n3-en" 3
  run hamamatsu-tennyu "control,senior-70s" 2
}
fill_minato() {
  run minato-tennyu "senior-70s,resident-n3,smartphone-novice,busy-worker,control-mobile,resident-n3-en" 3
  run minato-tennyu "control" 2
}
fill_oizumi() {
  run oizumi-tennyu "smartphone-novice,busy-worker,control-mobile,resident-n3-en" 2
  run oizumi-tennyu "control,senior-70s,resident-n3" 1
}
fill_shibuya() {
  run shibuya-tennyu "senior-70s,resident-n3,smartphone-novice,busy-worker,control-mobile,resident-n3-en" 2
  run shibuya-tennyu "control" 2   # 1회로 하면 배치째 버려진다. 위 주석 참조
}
fill_shinjuku() {
  run shinjuku-tennyu "resident-n3,smartphone-novice,busy-worker,control-mobile,resident-n3-en" 3
  run shinjuku-tennyu "control,senior-70s" 2
}

echo "=== 보충 시작 $(date '+%F %T') — 남은 82런 ==="
fill_hamamatsu & sleep 5
fill_minato    & sleep 5
fill_oizumi    & sleep 5
fill_shibuya   & sleep 5
fill_shinjuku  &
wait
echo "=== 보충 종료 $(date '+%F %T') ==="
