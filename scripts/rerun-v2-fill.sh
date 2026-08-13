#!/bin/bash
# 재측정 3차 보충. 2026-08-13. **잔액이 들어온 뒤에 돌린다.**
#
# 왜 또 필요한가:
#   ① 2차 보충이 OrcaRouter 잔액 소진(403)으로 죽었다. 19런이 중간에 끊겼다
#   ② 더 중요한 것 — 배치가 두 번 끊기면서 **회차 번호가 쏠렸다.**
#
# 회차 번호는 반복 횟수가 아니라 **조건**이다:
#   senior-70s        v0=12클릭·톱 시작 / v1=18클릭·검색 유입 / v2·v3=15클릭(기본)
#   smartphone-novice v0=10클릭 / v1=14클릭 / v2·v3=12클릭
#   busy-worker       v0=6클릭90초 / v1=10클릭150초 / v2·v3=8클릭120초
#
# `--variants N`은 언제나 0번부터 다시 센다. 그래서 이어 붙일 때마다 v0가 쌓이고
# v2·v3가 비었다. 그 상태로 집계하면 사이트마다 클릭 예산과 진입 지점이 달라지고,
# **「다른 것은 사이트뿐」이라는 이 프로젝트의 유일한 주장이 무너진다.**
# 그래서 `--variant-list`로 **빠진 번호만** 정확히 채운다. 60런.
#
# ⚠️ 한 배치에 1런만 들어가면 집계가 통째로 버린다(중단 배치를 걸러내는 장치).
#    新宿의 smartphone-novice v1 하나만 남아서, 같은 프로필의 v3와 묶어 2런으로 돌린다.
#
# 사이트끼리는 동시, 사이트 안에서는 순차 — 도메인당 동시성 1 (절대규칙 6).
set -u
cd "$(dirname "$0")/.."
mkdir -p agent/runs/_log

run() {  # run <mission> <profiles> <variant-list>
  npm run batch -- "$1" --profiles "$2" --variant-list "$3" --tag v2 >> "agent/runs/_log/$1.log" 2>&1
}

ALL="control,senior-70s,resident-n3,smartphone-novice,busy-worker,control-mobile,resident-n3-en"

fill_hamamatsu() {   # 9런
  run hamamatsu-tennyu "control,senior-70s" 2
  run hamamatsu-tennyu "$ALL" 3
}
fill_minato() {      # 14런
  run minato-tennyu "$ALL" 2
  run minato-tennyu "$ALL" 3
}
fill_oizumi() {      # 11런
  run oizumi-tennyu "smartphone-novice,busy-worker,control-mobile,resident-n3-en" 2
  run oizumi-tennyu "$ALL" 3
}
fill_shibuya() {     # 13런
  run shibuya-tennyu "senior-70s,resident-n3,smartphone-novice,busy-worker,control-mobile,resident-n3-en" 2
  run shibuya-tennyu "$ALL" 3
}
fill_shinjuku() {    # 13런
  run shinjuku-tennyu "smartphone-novice" 1,3          # 1런짜리 배치를 피하려고 묶었다
  run shinjuku-tennyu "control,senior-70s,busy-worker,control-mobile,resident-n3-en" 2
  run shinjuku-tennyu "control,senior-70s,resident-n3,busy-worker,control-mobile,resident-n3-en" 3
}

echo "=== 3차 보충 시작 $(date '+%F %T') — 60런 ==="
fill_hamamatsu & sleep 5
fill_minato    & sleep 5
fill_oizumi    & sleep 5
fill_shibuya   & sleep 5
fill_shinjuku  &
wait
echo "=== 3차 보충 종료 $(date '+%F %T') ==="
