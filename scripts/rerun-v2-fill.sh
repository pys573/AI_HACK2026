#!/bin/bash
# 재측정 3차 보충. 2026-08-13. **잔액이 들어온 뒤에 돌린다.**
#
# 왜 또 필요한가:
#   ① 2차 보충이 OrcaRouter 잔액 소진(403)으로 죽었다. 19런이 중간에 끊겼다
#   ② 더 중요한 것 — 배치가 두 번 끊기면서 **회차 번호가 쏠렸다.**
#
# ⚠️ 2026-08-13 정정 — 이 스크립트를 돌리는 동안 아래 전제가 **틀렸다는 것을 확인했다.**
#
#   [틀린 전제] 「회차 번호는 반복 횟수가 아니라 조건이다.
#               senior-70s v0=12클릭·톱 시작 / v1=18클릭·검색 유입 …」
#
#   프로필 JSON의 `variants`에는 그렇게 적혀 있다. 그런데 `constrain.ts`의 `variantOf()`가
#   거기서 꺼내는 것은 `suffix`와 `language_preference` 둘뿐이고, `patience`는 `run.ts`가
#   **프로필 최상위 값만** 읽는다. 즉 v0~v3는 전부 **같은 조건의 반복**이다.
#   (`FINDINGS.md` F13 / `agent/src/batch.ts`의 `variantList` 주석)
#
# 그래서 이 스크립트의 값어치는 **조건 보존이 아니라 셈의 정확성**이다.
# `--variants N`은 언제나 0번부터 다시 센다. 이어 붙일 때마다 v0가 쌓이고 v2·v3가 비면
# **어느 칸이 몇 번 돌았는지를 파일 이름으로 셀 수 없게 된다.**
# 그래서 `--variant-list`로 **빠진 번호만** 정확히 채운다. 60런.
#
# 실행 자체는 예정대로 끝났다 (60/60). 위 전제가 틀렸어도 결과는 오염되지 않는다 —
# 어느 번호를 채웠든 조건이 같기 때문이다. **틀린 것은 데이터가 아니라 설명이었다.**
#
# ⚠️ 한 배치에 1런만 들어가면 집계가 통째로 버린다(중단 배치를 걸러내는 장치).
#    新宿의 smartphone-novice v1 하나만 남아서, 같은 프로필의 v3와 묶어 2런으로 돌린다.
#
# 사이트끼리는 동시, 사이트 안에서는 순차 — 도메인당 동시성 1 (절대규칙 6).
set -u
cd "$(dirname "$0")/.."
mkdir -p agent/runs/_log

# 종료 코드 2 = OrcaRouter 잔액 소진. 그때는 이 사이트의 남은 배치도 돌리지 않는다.
# 빈 지갑으로 브라우저만 더 띄우면 error 런이 쌓이고, 그걸 나중에 가려내는 게 더 비싸다.
run() {  # run <mission> <profiles> <variant-list>
  npm run batch -- "$1" --profiles "$2" --variant-list "$3" --tag v2 >> "agent/runs/_log/$1.log" 2>&1
  local code=$?
  if [ "$code" -eq 2 ]; then
    echo "⛔ $1 — OrcaRouter 잔액 소진. 이 사이트의 남은 배치를 건너뛴다"
    return 2
  fi
  return 0
}

ALL="control,senior-70s,resident-n3,smartphone-novice,busy-worker,control-mobile,resident-n3-en"

fill_hamamatsu() {   # 9런
  run hamamatsu-tennyu "control,senior-70s" 2 || return 2
  run hamamatsu-tennyu "$ALL" 3 || return 2
}
fill_minato() {      # 14런
  run minato-tennyu "$ALL" 2 || return 2
  run minato-tennyu "$ALL" 3 || return 2
}
fill_oizumi() {      # 11런
  run oizumi-tennyu "smartphone-novice,busy-worker,control-mobile,resident-n3-en" 2 || return 2
  run oizumi-tennyu "$ALL" 3 || return 2
}
fill_shibuya() {     # 13런
  run shibuya-tennyu "senior-70s,resident-n3,smartphone-novice,busy-worker,control-mobile,resident-n3-en" 2 || return 2
  run shibuya-tennyu "$ALL" 3 || return 2
}
fill_shinjuku() {    # 13런
  # v1만 채우면 1런짜리 배치가 되어 집계가 통째로 버린다. 그래서 v3와 묶는다
  run shinjuku-tennyu "smartphone-novice" 1,3 || return 2
  run shinjuku-tennyu "control,senior-70s,busy-worker,control-mobile,resident-n3-en" 2 || return 2
  run shinjuku-tennyu "control,senior-70s,resident-n3,busy-worker,control-mobile,resident-n3-en" 3 || return 2
}

echo "=== 3차 보충 시작 $(date '+%F %T') — 60런 ==="
fill_hamamatsu & sleep 5
fill_minato    & sleep 5
fill_oizumi    & sleep 5
fill_shibuya   & sleep 5
fill_shinjuku  &
wait
echo "=== 3차 보충 종료 $(date '+%F %T') ==="
