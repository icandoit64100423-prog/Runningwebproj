# RunnerHub

러너의 훈련 기록·컨디션·대회·뉴스를 한곳에서 관리하는 한국어 러닝 웹 서비스. React + Tailwind + Supabase Edge Functions(Hono) + Gemini로 구성된 3-tier 아키텍처입니다.

---

## 1. 서비스 개요

| 페이지 | 목적 | 주요 기능 |
|---|---|---|
| **Record** (`/`) | 러닝 로그 입력·조회 | 거리·시간·페이스·칼로리 자동 계산, 8가지 러닝 타입(조깅/러닝/인터벌/롱런/템포런/회복런/트레드밀/레이스), 주간 목표 게이지(`GoalRing`), 운동 분포(`Sunburst`) |
| **Condition** | AI 코치 컨디션 분석 | "오늘 운동 예상 RPE" + 3일 연속 운동 + 전날 수면 → Gemini가 권장 강도/하향/회복 중 하나를 지시. 과거 리포트 보관·삭제 |
| **Competitions** | 대회 일정 & 신청 링크 | Open/Closed 자동 분류 (대회일 vs 오늘) |
| **News** | 러닝 뉴스 피드 | publisher 직접 RSS 기반, 썸네일·기사 링크 자동 추출 |
| **Admin** | 콘텐츠 관리 | 뉴스 RSS 자동 수집 → Pending 큐 → 승인/반려, 대회 수동 입력 |

로그인은 Supabase Auth(이메일/비밀번호) 기반. `ADMIN_UID` 상수로 지정된 단일 관리자만 Admin 페이지 사용.

---

## 2. 기술 스택

### Frontend
- **React 18** + **TypeScript** (Vite 기반)
- **Tailwind CSS v4** (`src/styles/theme.css`에 디자인 토큰)
- **Radix UI** + shadcn 스타일 컴포넌트 (`src/app/components/ui/`)
- **Recharts** — 분포 차트
- **Lucide-react** — 아이콘
- **Sonner** — toast
- **Motion** — 애니메이션

### Backend
- **Supabase Edge Function** (Deno + Hono web server) — `supabase/functions/server/index.tsx`
- **Supabase Auth** — 이메일/비밀번호 + 세션 관리
- **Supabase KV table** (`kv_store_00832e50`) — 단일 key-value 테이블에 모든 도메인 데이터 저장
- **Gemini API** (`gemini-2.5-flash` → `gemini-2.5-flash-lite` → `gemini-flash-latest` 순으로 폴백) — AI 코치

### 외부 데이터 소스
- **publisher RSS** — Runner's World, World Athletics, 동아일보 스포츠, 한겨레 스포츠 (Admin에서 추가/제거 가능)

---

## 3. 디렉토리 구조

```
src/app/
  App.tsx                      # 진입점, 라우팅 (탭 기반)
  components/
    RecordPage.tsx             # 러닝 기록
    ConditionPage.tsx          # AI 컨디션 코치
    CompetitionsPage.tsx       # 대회 목록
    NewsPage.tsx               # 뉴스 피드
    AdminPage.tsx              # 관리자 화면 + RSS/Pending 패널
    AuthPage.tsx               # 로그인/회원가입
    ProfileDialog.tsx          # 체중·주간목표 설정
    GoalRing.tsx, Sunburst.tsx # 시각화
    figma/ImageWithFallback.tsx
    ui/                        # Radix 기반 shadcn 컴포넌트
  lib/
    api.ts                     # 서버 호출 래퍼 (모든 fetch 단일 진입점)
    supabase.ts                # Supabase 클라이언트 싱글톤
    runTypes.ts                # 8가지 러닝 타입 + legacy 라벨 정규화
    useProfile.ts              # 프로필 훅
    analytics.ts               # 통계 derive

supabase/functions/server/
  index.tsx                    # Hono 서버 (모든 라우트)
  kv_store.tsx                 # KV 헬퍼 (수정 금지)

utils/supabase/info.tsx        # projectId / publicAnonKey
```

---

## 4. 데이터 모델 (KV 키 네임스페이스)

KV 테이블 하나에 prefix로 도메인을 구분합니다.

| 키 패턴 | 값 | 비고 |
|---|---|---|
| `run:<id>` | `{ id, user_id, date, distance, time, pace, calories, type, rpe, created_at }` | 사용자 러닝 기록 |
| `report:<userId>:<id>` | `{ id, user_id, rpe, is_continuous, sleep, notes, text, model, created_at }` | AI 코치 응답 보관 |
| `profile:<userId>` | `{ weight_kg, weekly_goal_km }` | 칼로리 계산·목표 |
| `news:<id>` | `{ id, title, link, published_at, source, thumbnail, created_at }` | 발행된 뉴스 |
| `competition:<id>` | `{ id, name, date, location, link, status }` | 발행된 대회 |
| `pending:news:<id>` | `{ id, kind, payload, source, created_at }` | 승인 대기열 |
| `bookmark:<userId>:<newsId>` | `true` | 북마크 |
| `config:rss_feeds:news` | `string[]` | Admin이 편집한 RSS URL 목록 |

> ⚠️ 단일 KV 테이블 구조이므로 새 도메인은 prefix 컨벤션을 추가해 구현합니다.

---

## 5. 주요 로직

### 5.1 러닝 기록 입력
- 거리·시간 입력 → 페이스(`min/km`)와 칼로리(`distance × weight × MET`)를 클라이언트가 계산
- 러닝 타입은 8개 키(`jogging` / `running` / `interval` / `long` / `tempo` / `recovery` / `treadmill` / `race`) — 서버에 저장 시 `normalizeRunType`이 한국어 라벨이나 옛 값도 키로 변환

### 5.2 AI 코치 (Condition)
1. 사용자가 **오늘의 예상 RPE**(1-10) + 3일 연속 운동 여부 + 전날 수면 시간 + (선택) 메모 입력
2. 서버가 최근 7일 러닝 로그를 컨텍스트로 합쳐 Gemini 프롬프트 구성
3. Gemini가 분석적인 말투로 "그대로 진행 / 하향 조정 / 회복일 전환" 중 하나를 지시
4. 응답을 `report:` KV에 저장 — 과거 리포트 목록·삭제 가능

### 5.3 뉴스 자동 수집 파이프라인 (RSS-only, Admin 전용)

```
[RSS 피드 N개]
   ↓ fetchFeed (브라우저 UA, 8s timeout)
[per-feed 러닝 키워드 필터]   ← 마라톤/러닝/하프/풀코스 등 합성어 정규식
   ↓
[round-robin interleave]      ← 한 매체가 독식하지 않도록 균등 분배
   ↓
[중복 제거]                    ← 기존 발행 항목 link 일치 + Jaccard ≥ 0.55
   ↓
[verifyUrl HEAD]              ← 죽은 링크 제거 (405/403 통과)
   ↓
[썸네일 추출]
  1. RSS의 <media:content> / <enclosure> / <itunes:image> / <img>
  2. resolveArticleUrl → og:image
  3. (Google News URL인 경우) news.google.com 페이지 og:image, generic 로고 필터
   ↓
[savePending → pending:news:<id>]
   ↓
[Admin 검토] → 승인 시 news:<id>로 발행 / 반려 시 삭제
```

- **`resolveArticleUrl`**: Google News 등 redirector 링크는 (1) URL 경로의 base64 protobuf 디코드 → (2) 실패 시 consent 쿠키 동반 fetch 후 `data-n-au` / canonical / JSON-embedded URL 패턴 추출.
- **링크 정책**: `<source url=...>`(매체 홈페이지) 폴백 금지. 디코드 실패 시 원본 URL을 저장 — JS 리디렉션이 클라이언트에서 정확한 기사로 안내.

### 5.4 대회 (수동 입력만)
- 자동 수집은 비활성화. Admin 폼에서 `name`, `date`, `location`, `link` 직접 입력
- 승인 시 또는 즉시 발행 시 `date >= today`이면 `status: "open"`, 아니면 `"closed"`로 자동 분류

### 5.5 인증·권한
- `Authorization: Bearer <publicAnonKey>` (모든 요청)
- 로그인 사용자만 호출 가능한 라우트는 `X-User-Token` 헤더로 access_token 전달 → `getUserId()`가 검증
- Admin 라우트는 `requireAdmin()`이 `ADMIN_UID` 상수와 일치 여부 확인

---

## 6. API 엔드포인트 (서버)

모든 경로 prefix: `/make-server-00832e50`

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| POST | `/signup` | - | 이메일·비밀번호 + name 가입 (`email_confirm: true`) |
| GET | `/runs` | user | 사용자 러닝 기록 |
| POST | `/runs` | user | 기록 추가 (type 정규화) |
| DELETE | `/runs/:id` | user | 기록 삭제 |
| GET | `/profile` | user | 체중·주간목표 |
| PUT | `/profile` | user | 프로필 갱신 |
| POST | `/ai-coach` | user | Gemini 분석 + report 저장 |
| GET | `/reports` | user | 과거 리포트 |
| DELETE | `/reports/:id` | user | 리포트 삭제 |
| GET | `/competitions` | - | 대회 목록 |
| GET | `/news` | - | 뉴스 목록 |
| GET | `/bookmarks` | user | 북마크 ID 목록 |
| POST | `/bookmarks/:id` | user | 북마크 추가 |
| DELETE | `/bookmarks/:id` | user | 북마크 제거 |
| POST | `/admin/competitions` | admin | 수동 추가 (배열) |
| DELETE | `/admin/competitions/:id` | admin | 삭제 |
| POST | `/admin/news` | admin | 수동 추가 |
| DELETE | `/admin/news/:id` | admin | 삭제 |
| POST | `/admin/ai-draft` | admin | 뉴스 RSS 수집 → pending. `kind: "competitions"`는 400 |
| GET | `/admin/rss-feeds` | admin | 현재/기본 RSS 피드 목록 |
| PUT | `/admin/rss-feeds` | admin | 피드 갱신 |
| GET | `/admin/pending?kind=` | admin | 대기열 조회 |
| POST | `/admin/pending/:id/approve` | admin | 승인·발행 |
| DELETE | `/admin/pending/:id` | admin | 반려 |

프론트는 `src/app/lib/api.ts` 한 곳에서 모든 호출을 래핑합니다 (에러 메시지에 status code + raw body 포함).

---

## 7. 환경 변수

서버 측에서 사용 (Supabase 콘솔에 미리 설정됨):
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY` — AI 코치

클라이언트는 `utils/supabase/info.tsx`의 `projectId`, `publicAnonKey`만 사용. **service role key는 절대 프론트에 노출 금지**.

---

## 8. 개발 / 실행

```bash
pnpm install
pnpm dev                                  # 프론트엔드 개발 서버
supabase functions deploy server          # Edge Function 배포
```

---

## 9. 알려진 제약 / 설계 결정

- **단일 KV 테이블**: prefix 기반 네임스페이싱으로 모든 도메인을 표현. 복잡한 인덱싱 대신 `getByPrefix`로 풀스캔 후 메모리 필터.
- **Google News aggregator 미사용**: 의도적으로 제거. 서명·암호화된 링크와 이미지 누락 문제로 publisher 직접 RSS만 사용.
- **러닝 키워드 필터**: 일반 스포츠 RSS의 비러닝 항목을 거르기 위해 합성어 위주 정규식 사용 — "트랙"/"페이스"/"running" 단독은 다른 종목과 충돌해 제외.
- **대회 자동 수집 폐기**: Hallucination·중복·날짜 모호성 문제로 LLM 추출 비활성화. 수동 입력만 지원.
- **Admin 단일 사용자**: `ADMIN_UID` 상수 기반. 다중 관리자가 필요하면 KV에 `admin:<uid>` 플래그 추가하는 방향으로 확장.

---

## 10. 코드 진입점 빠른 참조

- 새 페이지 추가 → `src/app/App.tsx`의 탭 분기
- 새 서버 라우트 → `supabase/functions/server/index.tsx` (반드시 `/make-server-00832e50` prefix)
- 새 데이터 종류 → KV prefix 결정 후 `kv.set/getByPrefix` 사용
- 디자인 토큰 → `src/styles/theme.css`
- 폰트 → `src/styles/fonts.css` (다른 파일에 import 금지)
