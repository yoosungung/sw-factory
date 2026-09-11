# Auth as user

각 persona는 factory의 **일반 유저**다. 멤버십 fail-closed·세션 쿠키 계약 그대로.

## 흐름

1. 기동 시 `POST /api/auth/login` `{ email, password }` (Secret에서 읽기).
2. `Set-Cookie: lt_session=…`를 persona `secrets/` 또는 메모리에 보관.
3. factory-mcp·필요 시 직접 REST가 동일 쿠키로 호출.
4. 만료 시 재로그인. Worker Cron이 만료 세션을 지우므로 TTL을 문서화(기본 세션 일수와 맞춤).

## 금지

- PAT / `x-api-key` 신설으로 agent 전용 인증을 우회하지 않는다.
- 여러 persona가 한 쿠키를 공유하지 않는다.
- PVC에 비밀번호를 평문 장기간 보관하지 않는다(Secret/env).

## users 표기

`agents.yaml`의 `user_id`(UUID) · `email`이 Worker `users`와 일치해야 한다. assignee 라우팅은 이 id로 한다.
