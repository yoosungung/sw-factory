# Frontend Design

SW Factory SPA. API는 `/api/*`만 사용.  
**Prod IA:** [ia/](ia/) ([overview](ia/overview.md) · [menus](ia/menus.md) · [pages](ia/pages.md) · [admin](ia/admin.md) · [design-system](ia/design-system.md)).  
API 설계: [backend/DESIGN.md](../backend/DESIGN.md) · 계약: [ARCHITECTURE.md](../ARCHITECTURE.md).

## 모듈

```
frontend/src/
    api.ts
    styles.css                          # UX0–UX5 토큰 · 보드/패널 · 모바일
    lib/brand.tsx · due.ts · view-mode.ts · recent.ts · savedViews.ts
    hooks/useDom.ts · useSession.ts
    components/EmptyState.tsx
    components/issue/RichContent.tsx    # Markdown(GFM) 읽기 렌더 · sanitize
    components/issue/IssuePanel.tsx     # F9 · non-modal inspector · 커스텀 픽커
    components/chrome/AppChrome.tsx     # TopNav · Sidebar · AppChrome · Quick Create
    components/create/CreateDialogs.tsx # Issue · Space · Project 생성
    pages/Auth.tsx · Home.tsx · ProjectWorkspace.tsx · Misc.tsx
    pages/Settings.tsx · Admin.tsx · Personal.tsx · Directory.tsx
    App.tsx                             # 라우트 + 세션 셸만
```

## 사용 흐름

- Top nav (직접 링크): Spaces(`/spaces`) / Projects(`/projects`) / Your work(`/`) / Search(⌘K) / Account / Create. Filters·Teams는 Top nav에 없음.
- Issue description/comments: 저장은 Markdown 문자열; 읽기는 `RichContent`(GFM + sanitize). Description은 click-to-edit textarea.
- Issue: assignee · due · priority 인라인 `PATCH`(+`version` 409), Comments/History/Files, 작성자·owner 삭제
- `/browse/:ticketId` 전체 페이지; 보드 `?issue=` sidebar/modal
- Space/Project settings: Details · People · Board(statuses CRUD) · Danger
- `/admin`: 플랫폼 admin 계정 목록 · Space 생성
- Your work: Assigned / Created by me / Recently viewed / Recent projects
- Search: `GET /api/search`
- Filters: localStorage 메타 + tickets API
- Space hub: Space Switcher + Space settings(좌측). Project: Overview(이름·설명·수행 중) / Tickets(Board|Backlog|Timeline|List)

## Commands

```bash
npm run dev
npm run build
npm test -- --config frontend/vitest.config.ts
```
