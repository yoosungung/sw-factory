---
name: bulk-api-probe
description: >-
  핵심 API 스모크(`/api/health` 등)를 확인하고 티켓에 남긴다.
---

# Bulk API probe

1. `FACTORY_BASE_URL`에 대해 `GET /api/health` 등 스모크
2. 실패 시 status·body 요약을 Active 코멘트에 기록
3. 통과 시 `qa:` 또는 관련 마커에 한 줄 증거
