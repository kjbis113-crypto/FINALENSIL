#!/bin/bash
# ENSIL 최초 세팅 — 인터넷 되는 곳에서 한 번만. 더블클릭으로 실행.
# ("확인되지 않은 개발자" 경고가 뜨면 우클릭 → 열기 → 열기)
cd "$(dirname "$0")" || exit 1
set -u

echo "== ENSIL 세팅 =="
echo

if ! command -v node >/dev/null 2>&1; then
  echo "Node 가 없습니다."
  echo "https://nodejs.org 에서 LTS(.pkg)를 설치한 뒤 이 파일을 다시 더블클릭하세요."
  echo
  read -r -p "엔터를 누르면 닫힙니다 " _
  exit 1
fi

echo "Node $(node -v)"

# corepack 은 Node 에 같이 들어있다 — pnpm 을 따로 설치하지 않아도 된다
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
if corepack enable pnpm >/dev/null 2>&1 && command -v pnpm >/dev/null 2>&1; then
  INSTALL="pnpm install"
  BUILD="pnpm build"
else
  echo "corepack 없음 — npm 으로 진행합니다"
  INSTALL="npm install"
  BUILD="npm run build"
fi

echo
echo "-- 사이트 의존성 설치"
$INSTALL || { echo "설치 실패"; read -r -p "엔터 " _; exit 1; }

echo
echo "-- 사이트 빌드 (dist/)"
$BUILD || { echo "빌드 실패"; read -r -p "엔터 " _; exit 1; }

echo
echo "-- 브릿지 의존성 설치 (ws 하나)"
(cd bridge && npm install --no-audit --no-fund) || { echo "브릿지 설치 실패"; read -r -p "엔터 " _; exit 1; }

echo
echo "== 완료 =="
echo "이제부터는 START-MAC.command 를 더블클릭하면 됩니다. 인터넷 없어도 됩니다."
echo
read -r -p "엔터를 누르면 닫힙니다 " _
