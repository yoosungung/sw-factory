# Frontend — Design System & UX Guidelines (Prod)

SW Factory 제품 전반의 **시각 디자인 시스템(Design Tokens)**과 **컴포넌트 인터랙션 패턴**, **반응형 규격**에 대한 정본 명세다.  
IA 구조는 [overview.md](overview.md), 메뉴는 [menus.md](menus.md), 화면별 레이아웃은 [pages.md](pages.md)를 참조한다.

---

## 1. 제품 비주얼 원칙 (Product Principles)

1. **Clarity over Clutter (명확성 우선):** 엔터프라이즈 이슈 트래커의 본질은 "지금 내가 해야 할 일"을 즉시 파악하는 데 있다. 시각적 장식(과도한 그라데이션, 제각각인 원색)을 걷어내고 데이터와 액션의 대비를 명확히 한다.
2. **Single Purpose Navigation (단일 내비게이션 진실 공급원):** 동일한 뷰 전환(Board/Backlog/Timeline/List)이나 동일한 설정 메뉴가 한 화면의 여러 곳(사이드바와 툴바)에 중복 노출되지 않도록 엄격히 일원화한다.
3. **Continuous Context (작업 맥락 유지):** 이슈 상세 조회 시 보드나 리스트 작업 화면을 완전히 덮지 않는 **논모달 사이드 인스펙터(Non-modal Side Panel)**를 기본으로 하여, 카드를 넘나들며 편집할 수 있는 연속성을 보장한다.
4. **No White Void (빈 상태 안내 의무):** 데이터가 없는 화면(타임라인, 검색 결과, 빈 백로그)에서 흰색 공백 화면을 방치하지 않고, 표준 `EmptyState` 컴포넌트를 통해 "현재 상태 설명 + 등록 가이드 + 즉시 생성 액션(CTA)"을 필수로 제공한다.
5. **Mobile First Readability (모바일 가독성 완결):** 390px 뷰포트에서도 텍스트 잘림이나 가로 넘침이 발생하지 않도록 반응형 헤더와 적응형 레이아웃을 준수한다.

---

## 2. 디자인 토큰 스펙 (Design Tokens)

### 2.1 Color Tokens (시맨틱 색상 체계)

구형 Jira의 어두운 탑바와 파편화된 색상을 배제하고, 일체감 있는 현대적 B2B SaaS 팔레트를 정의한다.

```css
:root {
  /* Brand Primary */
  --color-brand: #2563eb;          /* Modern Royal Blue */
  --color-brand-hover: #1d4ed8;
  --color-brand-subtle: #eff6ff;
  --color-brand-text: #1e40af;

  /* Surfaces & Backgrounds (Clean Light Chrome) */
  --color-bg-canvas: #f8fafc;      /* Slate 50 (전체 배경) */
  --color-bg-surface: #ffffff;     /* Card & Panel */
  --color-bg-surface-sunken: #f1f5f9; /* Column & Table Header */
  --color-bg-surface-hover: #f8fafc;
  --color-bg-surface-active: #e2e8f0;

  /* Borders & Dividers */
  --color-border-subtle: #e2e8f0;  /* Slate 200 */
  --color-border-default: #cbd5e1; /* Slate 300 */
  --color-border-focused: #2563eb;

  /* Text Hierarchy */
  --color-text-primary: #0f172a;   /* Slate 900 (헤딩/본문) */
  --color-text-secondary: #475569; /* Slate 600 (보조 레이블) */
  --color-text-muted: #94a3b8;     /* Slate 400 (플레이스홀더/비활성) */
  --color-text-inverse: #ffffff;

  /* Semantic Status & Priority */
  --color-status-backlog: #64748b; /* Slate */
  --color-status-todo: #0284c7;    /* Sky */
  --color-status-in-progress: #d97706; /* Amber */
  --color-status-done: #16a34a;    /* Green */

  --color-prio-urgent: #dc2626;    /* Red 600 */
  --color-prio-high: #ea580c;      /* Orange 600 */
  --color-prio-medium: #2563eb;    /* Blue 600 */
  --color-prio-low: #64748b;       /* Slate 500 */
}
```

### 2.2 Typography Scale (타이포그래피 위계)

| Level | Size | Weight | Line Height | 용도 |
| :--- | :---: | :---: | :---: | :--- |
| **Display / Page H1** | 22px | 700 (Bold) | 28px | 페이지 타이틀 (Board, Backlog, Projects) |
| **Section H2** | 16px | 600 (SemiBold) | 24px | 컬럼 헤더, 모달 타이틀, 패널 섹션 헤더 |
| **Card Title / Row** | 14px | 500 (Medium) | 20px | 티켓 제목, 테이블 데이터 기본 텍스트 |
| **Body / Input** | 13px | 400 (Regular) | 18px | 폼 인풋, 드롭다운 옵션, 설명글 |
| **Meta / Badge** | 11px | 600 (SemiBold) | 16px | 티켓 키(`MOB-101`), 우선순위 뱃지, 날짜 태그 |

*규칙:* 한국어 본문에서 인위적인 `text-transform: uppercase`를 지양하고 자간은 `-0.01em`으로 정돈한다.

### 2.3 Spacing, Radius & Elevation

| Token | Size | 적용 대상 |
| :--- | :---: | :--- |
| **Radius Sm** | 4px | 뱃지, 칩, 버튼, 태그 |
| **Radius Md** | 8px | 보드 카드, 인풋, 드롭다운 메뉴, 알럿 |
| **Radius Lg** | 12px | 컬럼 컨테이너, 다이얼로그 모달, 사이드 인스펙터 패널 |
| **Shadow Subtle** | `0 1px 2px 0 rgba(0, 0, 0, 0.05)` | 보드 카드 기본 상태 |
| **Shadow Hover** | `0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.05)` | 보드 카드 호버/드래그 |
| **Shadow Float** | `0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.05)` | 드롭다운 팝오버, 퀵 크리에이트 |
| **Shadow Modal** | `0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)` | 중앙 다이얼로그 모달 |

---

## 3. 핵심 컴포넌트 인터랙션 패턴 (Interaction Patterns)

### 3.1 Top Navigation & Chrome
- **라이트 모던 크롬:** 탑바 높이 48px 고정, 배경은 `#ffffff`, 하단 `border-bottom: 1px solid var(--color-border-subtle)`.
- **단일 브랜드 로고:** 에메랄드/네이비 충돌을 없애고 로고와 Primary 컬러(`--color-brand`)를 일치시킴.
- **검색창:** 탑바 검색창은 ⌘K 단축키 힌트를 우측에 노출하는 컴팩트한 인풋으로 유지하고, 전역 검색 페이지(`/search`) 진입 시에는 탑바 검색창이 아닌 중앙 포커스 인풋을 메인으로 동작시킴.

### 3.2 View Switching (뷰 전환 일원화)
- **문제 해결:** 사이드바와 메인 툴바의 `Timeline/Backlog/Board/List` 링크 완전 중복 제거.
- **표준 구조:**
  - **사이드바:** 프로젝트 컨텍스트 전환(개요, 작업, 설정)만 담당.
  - **작업 화면 툴바:** 상단 타이틀 우측의 **세그먼트 탭(Segmented Tab Control)**에서만 `Board | Backlog | Timeline | List` 전환 수행. (단일 진실 공급원)

```
┌─ Toolbar ────────────────────────────────────────────────────────┐
│ Mobile Banking App  [ Board | Backlog | Timeline | List ]  [Filter] [Search] │
└──────────────────────────────────────────────────────────────────┘
```

### 3.3 Sidebar Space Management (스페이스 목록 오염 방지)
- **문제 해결:** 사이드바 최하단에 수십 개의 전역 스페이스가 길게 나열되는 현상 제거.
- **표준 구조:** 사이드바 상단 프로젝트 정보 영역에 **스위처 드롭다운(`[Audit Space ▾]`)** 형태로 배치하여, 클릭 시에만 팝오버로 스페이스를 변경할 수 있도록 압축.

### 3.4 Board & Card Specification (정보 밀도 강화)
- **카드 구성:**
  - 상단 메타: 타입 아이콘(Task/Milestone) + 키(`MOB-F416`) + 우선순위 뱃지(High/Medium/Low 컬러 태그).
  - 본문: 최대 2줄 제목 말줄임 (`-webkit-line-clamp: 2`).
  - 하단 푸터: 마감일 태그(`due_at`, 기한 임박 시 주황/경과 시 빨강) + 우측 정렬된 담당자 원형 아바타(20px).
- **가로 스크롤 UX:** 화면 너비가 좁아 우측 컬럼(Done)이 가려질 경우, 우측 가장자리에 부드러운 화이트 그라데이션 페이드와 스크롤 인디케이터 제공.

### 3.5 Timeline & Empty State System (공백 화면 방지)
- 모든 뷰(Timeline, Search, Backlog, Your work)는 데이터가 0건일 때 표준 `EmptyState` 컴포넌트를 렌더링한다.
- **EmptyState 규격:**
  1. 중앙 정렬 (수직/수평 가운데 배치, 최소 높이 240px)
  2. 부드러운 서피스 일러스트/아이콘 (48px Slate-400)
  3. 명확한 상태 제목 (예: "Timeline is empty" — Backlog/List와 `{View} is empty` 동일 형태)
  4. 구체적인 안내 문구 (예: "Work items you create show up here so you can see the project schedule.")
  5. 즉시 액션 버튼 — **의미 있는 next step이 있을 때만.** Board/Backlog/Timeline의 in-view 티켓 생성은 보류(탑바 **Create**만). Timeline·Backlog empty는 제목+안내만. Your work Assigned/Created/Viewed도 CTA 생략. "Go to projects" 같은 자리채우기 링크는 넣지 않는다.

### 3.6 Issue Panel: Non-modal Inspector vs Centered Modal
- **Non-modal Inspector (기본):**
  - 카드를 클릭했을 때 우측에서 열리는 사이드 패널.
  - **오버레이 딤(Backdrop) 제거.** 뒤쪽 보드가 어두워지지 않고 그대로 상호작용 가능.
  - 사용자가 다른 카드를 클릭하면 즉시 해당 카드로 패널 내용이 전환됨.
  - 패널 상단에 프로젝트 브레드크럼, `[전체 화면으로 열기 ↗]` 및 `[닫기 ✕]` 제공.
- **Centered Modal (집중 모드) & Full Page:**
  - 단축키 또는 명시적 모달 모드(`?issueUi=modal`) 호출 시 어두운 배경 딤과 함께 화면 중앙에 팝업 (`min(920px, 100%)`).
  - **2열 분할 레이아웃(Split View):** 좌측(본문 65%~70%: 제목, 설명, 언더라인 액티비티 탭)과 우측(속성 30%~35%: Details 카드 및 삭제 액션). 모바일/협소 화면에서는 1열로 유연하게 반응.
- **폼 컨트롤 및 위험 액션:**
  - 투박한 기본 `<select>`와 인풋을 배제하고, 일관된 32px 높이와 은은한 서피스 토큰의 통일된 픽커(Status/Priority 뱃지, 아바타 지원 Assignee, Date picker) 적용.
  - 제목 입력 필드는 긴 텍스트 입력 시 자연스럽게 개행(`textarea` auto-resize)되어 글자가 잘리지 않도록 처리.
  - 티켓 삭제(Delete issue)는 화면을 압도하는 거대 빨간 박스를 배제하고, 우측 속성 패널 하단에 은은한 텍스트/아이콘 버튼(`btn-delete-subtle`, 호버 시 레드 강조)으로 배치하여 시각적 안정성 확보.

### 3.7 Project Settings Shell (이중 사이드바 제거)
- **문제 해결:** 프로젝트 사이드바 옆에 설정 사이드바가 나란히 붙어 2개의 사이드바가 화면의 40%를 차지하는 문제 해결.
- **표준 구조:** `/projects/:id/settings/*` 진입 시, 상단 브레드크럼(`Projects / Project Name / Settings`)을 제공하고 좌측 메인 사이드바는 컴팩트하게 접거나(Collapsed), 설정 전용 단일 사이드바로 깔끔하게 치환한다.
- **본문 폭:** Details·Board 등 폼 영역(`.settings-form`)은 max-width **720px** (입력은 컨테이너 전체 폭).

### 3.8 Responsive & Mobile Rules
- **Breakpoints:**
  - Mobile: `< 768px`
  - Tablet: `768px ~ 1024px`
  - Desktop: `> 1024px`
- **Mobile Header:**
  - 데스크톱 메뉴를 숨기고 좌측 `[☰ 로고]` + 우측 `[Search] [Avatar]`로 압축.
  - 햄버거 메뉴 터치 시 슬라이드오버 드로어로 내비게이션 노출.
- **Text Truncation 방지:** 컨테이너 `overflow-x: hidden` 및 패딩을 16px로 리셋하여 텍스트 첫 글자가 잘리는 현상("ROJECTS", "PACES") 원천 차단.
- **터치 타겟:** 모든 버튼, 칩, 링크의 최소 터치 영역을 `40px x 40px` 이상 확보.
