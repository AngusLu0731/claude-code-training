#!/usr/bin/env bash
# 上線檢查：training 子網域 200 且 TLS 有效；apex 不放教材。全過印 LIVE_OK。
set -u
code=$(curl -o /dev/null -sS -w '%{http_code}' https://training.angus-lu.cc/)
if test "$code" != 200; then
	echo "FAIL: https://training.angus-lu.cc/ 回 $code（curl 預設驗 TLS，憑證壞也會到這裡）" >&2
	exit 1
fi
if curl -sS https://angus-lu.cc/ 2>/dev/null | grep -q "Claude Code 進階實作教材"; then
	echo "FAIL: apex angus-lu.cc 也看得到教材，應該只有 training 子網域" >&2
	exit 1
fi
echo LIVE_OK
