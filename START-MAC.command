#!/bin/bash
# ENSIL 전시 시작 — 더블클릭. 이 터미널 창은 닫지 마세요 (닫으면 사이트와 릴레이가 꺼집니다).
cd "$(dirname "$0")" || exit 1
set -u

if [ ! -f dist/index.html ]; then
  echo "dist/ 가 없습니다 — SETUP-MAC.command 를 먼저 더블클릭하세요."
  read -r -p "엔터 " _
  exit 1
fi

# 이 기기의 LAN 주소 전부 — 다른 기기(빔프)에서 열 주소. 허브 없이 '인터넷 공유'로 와이파이를
# 만들면 주소가 en0 이 아니라 bridge100 에 붙으므로 인터페이스를 가리지 않고 모두 찍는다.
IPS=$(ifconfig 2>/dev/null | awk '/inet / && $2 != "127.0.0.1" { print $2 }')

echo "======================================================"
echo " ENSIL 브릿지"
echo
echo "  이 기기         http://localhost:8080/"
for ip in $IPS; do
  echo "  다른 기기       http://$ip:8080/"
done
[ -z "$IPS" ] && echo "  다른 기기       (아직 망에 붙지 않음 — 와이파이/인터넷 공유를 켠 뒤 이 창을 다시 여세요)"
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
