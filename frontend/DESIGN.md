# Frontend Design

Jira Software와 **같은 사용 방식**을 프론트에서 모사한다. API는 기존 `/api/*`만 사용.  
**Prod IA:** [ia/](ia/) ([overview](ia/overview.md) · [menus](ia/menus.md) · [pages](ia/pages.md) · [admin](ia/admin.md)).  
API 설계: [backend/DESIGN.md](../backend/DESIGN.md) · 계약: [ARCHITECTURE.md](../ARCHITECTURE.md).

## 모듈

```
frontend/src/
    api.ts
    lib/recent.ts · savedViews.ts   # recent + Filters/Dashboards local
    components/issue/IssuePanel.tsx   # F9 · History · 409 · direct upload
    pages/Settings.tsx                # Space/Project settings (FE4)
    pages/Personal.tsx                # Your work · Account · Search (FE3)
    pages/Directory.tsx               # Filters · Dashboards (FE5 local)
    App.tsx                           # 크롬·뷰·라우트 · List 페이징 · Done 아카이브
```

## 사용 흐름

- Top nav: Your work / Projects / Filters / Dashboards / Teams / Search(⌘K) / Profile(`/account`) / Create
- Issue: assignee · due · priority 인라인 `PATCH`(+`version` 409), Comments/History/Files, 작성자·owner 삭제
- `/browse/:ticketId` 전체 페이지; 보드 `?issue=` sidebar/modal
- Space/Project settings: Details · People · (Board) · Danger
- Your work: Assigned / Recently viewed / Recent projects
- Search: `GET /api/search`
- Filters·Dashboards: localStorage 메타 + tickets API
- List: cursor Load more · Board: Include archived Done

## Commands

```bash
npm run dev
npm run build
```
