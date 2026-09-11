# frontend/ia — SPA Prod IA

메뉴·페이지·관리 화면의 **제품 IA 정본**. API 계약은 [ARCHITECTURE.md](../../ARCHITECTURE.md) · 설계 근거는 [backend/DESIGN.md](../../backend/DESIGN.md). 코드 레이아웃·Commands는 [../DESIGN.md](../DESIGN.md).

| 문서 | 내용 |
| --- | --- |
| [overview.md](overview.md) | 제품 원칙, 크롬, IA, 라우트 맵, status/type |
| [menus.md](menus.md) | Top nav · Project sidebar · Space · Avatar 메뉴 |
| [pages.md](pages.md) | 화면별 레이아웃·동작·API·연결 |
| [admin.md](admin.md) | Space/Project/Account + 플랫폼 Admin |
| [design-system.md](design-system.md) | 디자인 토큰, 비주얼 원칙, 컴포넌트 인터랙션, Empty State, 반응형 규칙 |

## 범위 (Prod)

- **포함:** Auth, Spaces(`GET /api/clients`), Projects, Your work, Board/Backlog/Timeline/List, Issue, Search, Filters·Dashboards(Search/Your work에서 연결, Top nav 없음), Teams/People(settings), Space·Project·Account **관리**, 플랫폼 `/admin`
- **Exclude (UI 없음):** timesheets, calendar, notifications 벨, canvas/ideas/wiki/goals, plugins, 전역 settings, access_tokens/PAT — [backend §2](../../backend/DESIGN.md#2-도메인-범위)
- **Defer (설계만·승격 전):** Sprints UI, Issue field History 탭 UX 보강, 고급 리포트

MVP 축소 범위는 쓰지 않는다. 구현 순서는 [ROADMAP.md](../../ROADMAP.md); **화면·메뉴는 이 폴더가 IA 정본**.
