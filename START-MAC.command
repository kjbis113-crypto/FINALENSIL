#!/bin/bash
# ENSIL 전시 시작 — 더블클릭. 이 터미널 창은 닫지 마세요 (닫으면 사이트와 릴레이가 꺼집니다).
cd "$(dirname "$0")" || exit 1
set -u

if [ ! -f dist/index.html ]; then
  echo "dist/ 가 없습니다 — SETUP-MAC.command 를 먼저 더블클릭하세요."
  read -r -p "엔터 " _
  exit 1
fi

# 이 기기의 LAN 주소 — 다른 기기(빔프/아이맥)에서 열 주소
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")

echo "======================================================"
echo " ENSIL 브릿지"
echo
echo "  이 기기         http://localhost:8080/"
[ -n "$IP" ] && echo "  다른 기기       http://$IP:8080/"
echo
echo "  필드1 (웹)      /            "
echo "  필드2 (빔프)    /stage.html  ← 또는 아무 페이지에서 control+option+shift+O"
echo
echo "  방화벽이 'node 가 연결을 받도록 허용?' 하고 물으면 반드시 허용하세요."
echo "  이 창을 닫으면 전부 꺼집니다."
echo "======================================================"
echo

# 이 기기에서도 볼 거면 브라우저를 띄운다 (빔프 기기라면 stage.html 로 바꿔서 쓰세요)
(sleep 2 && open "http://localhost:8080/") >/dev/null 2>&1 &

node bridge/index.js
