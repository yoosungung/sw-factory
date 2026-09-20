# Auth as user

각 persona는 factory의 **일반 유저**다. 멤버십 fail-closed·세션 쿠키 계약 그대로.

## 흐름

1. Pod 기동 시 `seed-cookies-cli`가 `type: sessions`마다 `POST /api/auth/login` `{ email, password }` (`PERSONA_PASSWORD` 또는 `PERSONA_PASSWORD_<NAME>`).
2. `Set-Cookie: lt_session=…`를 그 persona의 `secrets/session.cookie`에 저장하고 `.cursor/mcp.json`을 쓴다.
3. factory-mcp는 그 파일만 읽는다. `GATEWAY_SESSION_COOKIE`는 gateway 이벤트 폴링용이며 persona 쿠키가 아니다.
4. 만료 시 다음 기동에서 재로그인. Worker Cron이 만료 세션을 지우므로 TTL을 문서화(기본 세션 일수와 맞춤).

## 금지

- PAT / `x-api-key` 신설으로 agent 전용 인증을 우회하지 않는다.
- 여러 persona가 한 쿠키를 공유하지 않는다.
- PVC에 비밀번호를 평문 장기간 보관하지 않는다(Secret/env).

## users 표기

`agents.yaml`의 `user_id`(UUID) · `email`이 Worker `users`와 일치해야 한다. assignee 라우팅은 이 id로 한다.
