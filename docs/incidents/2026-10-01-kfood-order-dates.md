# K-food 주문 날짜 및 메모 표시 조사 — 2026-10-01

## 확인 범위

- Shopify Admin 실제 주문 화면, CLEVER Orders의 Date pending 목록, 운영 DB의 Shopify 원본과 delivery facts를 읽기 전용으로 대조했다.
- 시간은 모두 `America/Toronto`이며, 확인한 운영 마감 설정은 화요일 17:00이다.
- 운영 K-food 앱 이미지: `568f2034930eb63bfbf8297b1ac4963bae5e69e1`.
- 서버 계산 경로는 `clever-route-server`의 `origin/main` `58258ad2a9d70b5886ec2ef2c4ce0ba6a4637859`에서 확인했다. 운영 서버 이미지와 이 커밋이 같다는 주장은 하지 않는다.
- Shopify 주문/고객, CLEVER 주문 날짜, 운영 배포를 변경하지 않았다.

## Date pending과 Shopify 원본 대조

| 주문 | 주문 시각 (Toronto) | Shopify의 배송 요청 | CLEVER |
| --- | --- | --- | --- |
| #2303 | 9/29 09:41 | 메모에 #2253과 함께 금요일 저녁배송 요청 | Date pending |
| #2310 | 9/29 17:23 | 메모에 10/2 금요일 배송 요청 | Date pending |
| #2308 | 9/29 17:10 | 메모에 Mid-Town / Thursday | Date pending |
| #2307 | 9/29 17:05 | 메모에 10/8 목요일 Vaughan 배송 | Date pending |
| #2324 | 9/30 07:54 | 메모에 10/3 토요일 런던 배송 요청 | Date pending |
| #2334 | 9/30 13:52 | 메모와 배송 속성 없음 | Date pending |
| #2284 | 9/26 19:47 | 메모에 10/3 토요일 배송 요청; 속성에는 Order Type만 존재 | Date pending |

#2303과 #2310은 사용자가 설명한 금요일 요청 주문의 후보이다. 사용자가 최초 두 주문의 번호를 확인하지 않았으므로 그 두 건과 동일하다고 단정하지 않는다. #2310은 실제 17시 이후 주문이므로 마감 전 주문의 반례가 아니다. #2303의 메모에는 10/2라는 명시 날짜가 없지만, 합배송 대상으로 명시한 #2253은 실제 `2026.10.02 금요일 저녁배송` 경로에 포함돼 있다.

이 주문들은 구조화된 `customAttributes`의 Delivery Day / Delivery Date가 비어 있다. 현재 날짜 mapper는 이 속성들을 읽고 자유형 `note`를 배송 날짜로 해석하지 않는다. 제품명에 있는 주간 날짜 범위 역시 특정 배송일의 확정 근거가 아니다. 메모를 보여주는 문제와 배송일을 확정하는 문제는 별도로 처리해야 한다.

## 마감 전 주문의 잘못된 주차 계산

| 주문 | 주문 시각 (Toronto) | 구조화된 배송 요일 | 운영 저장 날짜 | 화요일 17:00 규칙의 날짜 |
| --- | --- | --- | --- | --- |
| #2300 | 9/28 23:17 | Friday | 10/2 | 10/2 |
| #2301 | 9/29 01:47 | Saturday | 10/10 | 10/3 |
| #2302 | 9/29 03:43 | Saturday | 10/10 | 10/3 |
| #2304 | 9/29 10:39 | Friday 5pm to 9pm | 10/9 | 10/2 |
| #2305 | 9/29 11:00 | Saturday | 10/10 | 10/3 |
| #2306 | 9/29 12:21 | Thursday | 10/8 | 10/1 |

위 저장 날짜의 provenance는 `ORDER_DATE_CYCLE_RULE`이다. 원본 주문 시각을 순수 계산 함수에 입력하면 설정을 생략한 결과가 운영 값과 모두 일치하고, 화요일 17:00 설정을 전달하면 마지막 열과 일치한다. 16:59/17:00/17:01 경계도 각각 이번 주/다음 주/다음 주로 계산됐다.

원인은 UTC 문자열 표시가 아니라 **자동 주문 수신 경로에 배송 마감 설정이 전달되지 않는 것**이다.

- `order-webhook.processor.ts`: `mapShopifyOrderNodeToDeliveryInputs(data.node)` 호출 시 설정 생략.
- `order-sync.service.ts`: `syncUpdatedOrdersPage()` 역시 설정 생략.
- `order-reconciliation.service.ts`: 마감 설정 provider 없이 sync service를 생성.
- `order-delivery-scope.ts`: 설정이 없으면 화요일 00:00부터 다음 배송 주차가 되는 기존 calendar fallback 사용. 설정을 받는 계산은 Toronto 17:00을 올바르게 처리.
- 수동 snapshot/batch sync만 요청의 `deliveryCycle`을 전달한다. 앱의 background full reconciliation 요청은 이를 전달하지 않는다.

이전 앱 시간대 변경은 화면 표시와 route 시작 시간 중심이었다. 그 변경으로 자동 수신·동기화의 마감 설정 전달까지 검증됐다고 볼 수 없다.

## 주문번호 오른쪽 메모 누락

Shopify 원본에는 #2303과 #2310의 메모가 있지만, 운영 Orders DOM에는 두 행 모두 `Show notes for …` 버튼이 없다. 따라서 사용자가 지적한 누락은 실제로 확인됐다.

서버 `CanonicalOrderRow` / `toCanonicalOrderRow()`가 주문 `note`와 `rawPayload`를 목록 응답에 포함하지 않는다. 앱의 canonical-first Orders는 Shopify 원본 rows와 합치지 않으므로 UI의 raw fallback에도 메모가 도달하지 않는다. 또한 서버가 반환하는 `customerNote`를 앱 canonical mapper가 버리고 있었다. 이 값은 서버에서 stop instructions를 사용하므로 원래 주문 메모가 잘못된 이름으로 전달될 수도 있다. 앱의 필드 보존으로 메모 아이콘이 복구될 가능성과 별개로, 서버의 additive `note` projection 및 주문/고객 메모 의미 구분을 함께 검증해야 한다. 매 필터 요청마다 Shopify 원본을 다시 읽는 우회 경로는 추가하지 않는다. 자유형 메모를 자동 배송일로 확정하는 변경도 포함하지 않는다.

## Shopify session expired — 앱 수정과 서버 확인을 함께 전달

앱에서 확인하고 수정한 결함은 두 가지다. Orders resource wrapper가 새로운 Authorization 헤더를 오래된 body token으로 덮었고, 완료된 session token을 최대 30초 자체 캐시했다. 현재 변경은 헤더를 보존하고 동시 토큰 발급 요청만 합친다.

이것만으로 운영 session expired의 전체 원인이 해결됐다고 볼 수 없다. 앱 `route-plans.server.js`는 Delivery API의 401을 `Shopify session expired`와 `X-Shopify-Retry-Invalid-Session-Request: 1` 응답으로 변환한다. 서버의 만료뿐 아니라 다른 토큰 검증 실패도 같은 화면 문구로 보일 수 있다.

서버 읽기 전용 코드 확인:

- `routes/admin-session-auth.ts`의 `shopify_admin_session_token_rejected` 로그는 `reason`과 `surface`를 구분한다. `expired`, `not_active_yet`, `audience_mismatch`, `signature_mismatch`, `app_mismatch`, `shop_mismatch` 등을 확인할 수 있다.
- `modules/shopify/session-token-verifier.ts`는 epoch 초로 `exp <= now`와 `nbf > now`를 검사하고, audience별 credential과 요청의 expected app을 검증한다. 이 경로는 배송 마감의 Toronto wall-clock 계산과 별개다.
- `routes/admin-orders.routes.ts`는 토큰 검증 실패를 401 `UNAUTHORIZED`로 반환한다. 운영에서 실제 어느 reason이 발생했는지는 아직 로그로 확인하지 않았다.

서버 후속 범위에는 운영 실패 원인 분류, K-food credential/app 연결과 서버 시각 점검, 만료 토큰 거절 후 새 토큰 재시도 성공의 연결 검증이 포함돼야 한다. 원인 확인 없이 만료 검증을 완화하거나 세션 만료 시간을 늘리는 변경은 하지 않는다.

## 서버 저장소 후속 작업

대상: `/Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/04_CLEVER_Route/clever-route-server`

다른 저장소 구현은 현재 Shopify 앱 작업 범위 밖이다. 아래 내용을 해당 프로젝트에 전달할 수 있다.

```text
K-food 주문 마감 설정 누락, 메모 응답 누락, Shopify session expired를 함께 조사·수정하세요.
대상: /Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/04_CLEVER_Route/clever-route-server

Shopify 앱 docs/incidents/2026-10-01-kfood-order-dates.md의 운영 읽기 전용 대조를 참고하세요.
화요일 17:00 America/Toronto 설정인데 webhook, syncUpdatedOrdersPage,
reconciliation이 deliveryCycle을 mapper에 전달하지 않아 기존 화요일 00:00
fallback을 사용합니다. #2304는 9/29 10:39 Toronto 주문인데 10/9로 저장됐고,
설정을 전달한 순수 계산은 10/2입니다. #2301/#2302/#2305/#2306도 같은 패턴입니다.

상점/app별 유효 설정의 정본을 확인한 후 webhook/pull/reconciliation/manual 경로가
동일한 설정을 사용하도록 최소 수정하세요. 특정 상점 값을 하드코딩하지 마세요.
설정 조회 실패를 조용한 기본값 적용으로 숨기지 마세요.
Toronto EDT/EST와 화요일 16:59/17:00/17:01, 각 ingestion 경로 전달 계약을 검증하세요.

기존 데이터 보정은 별도 dry-run으로 범위를 산정하세요. 이미 배정·진행·완료된 경로와
수동 보정 날짜를 보존하고, 백업/복구 및 조건부 적용 계획을 먼저 제시하세요.
#2306은 실제 배달 진행/완료 증거가 있어 무조건 재계산하면 안 됩니다.
Shopify 원본 주문·고객은 변경하지 마세요. 배포 및 운영 데이터 변경은 별도 승인 대상입니다.
메모만 있는 Date pending 주문은 확정 날짜 근거 부족 문제이므로 임의 날짜를 채우지 마세요.

추가로 Orders 주문번호 오른쪽 메모 누락도 고치세요. 운영 rawPayload.note에 값이
있는 #2303/#2310 모두 현재 목록에서 메모 버튼이 없습니다.
order-sync.mapper.ts의 CanonicalOrderRow 타입과 order-sync.repository.ts의
toCanonicalOrderRow()에 원본 order note를 additive field로 노출하세요.
현재 customerNote는 반환하지만 order note/rawPayload는 반환하지 않습니다.
주문 메모/고객 메모 구분, 없음/공백, canonical-first query 응답을 테스트하고,
앱의 메모 보존 변경과 함께 실제 주문번호 옆 버튼/팝오버를 검증하세요.
전체 rawPayload를 목록에 노출하거나 Shopify 재조회로 우회하지 마세요.

Shopify session expired도 전달 범위에 포함합니다. 앱에서는 새 Authorization을
오래된 body token으로 덮던 Orders wrapper와 완료 토큰의 자체 캐시를 수정했습니다.
운영 전체 원인은 미확정이며 서버 확인 없이 해결 완료로 처리하면 안 됩니다.

1. 운영 shopify_admin_session_token_rejected 로그의 reason/surface를 확인해
   expired, not_active_yet, audience/signature/app/shop mismatch를 구분하세요.
   Orders page/facets/map과 Routes 요청의 발생 시점 및 재시도를 대조하세요.
   토큰 원문, secret, 개인정보를 로그나 보고서에 노출하지 마세요.
2. session-token-verifier.ts의 exp/nbf와 서버 epoch 시각, K-food audience별
   credential 및 expectedAppId 연결을 확인하세요. 배송일 EDT/UTC 문제와
   JWT 만료 판정은 별개이며, 운영 오류 증거 없이 검증을 완화하지 마세요.
3. 만료 토큰은 401로 거절되고 새 유효 토큰은 같은 요청에서 성공하는지,
   앱의 invalid-session retry 경로와 연결해 테스트하세요. 정상 만료와
   영구적인 app/credential 불일치를 모두 '재로그인하면 해결'로 처리하지 마세요.
4. 앱 token/header 수정과 서버 검증을 통합해 유휴 후 복귀, 필터 연속 변경,
   페이지/지도 요청 동시 실행, Orders↔Routes 전환을 확인하세요.
   refresh/retry 반복이나 항상 Reload 안내로 끝나는지까지 검증하세요.

서버 원인이 확인되면 해당 결함만 수정하고, 확인되지 않으면 로그·재현 결과와
미확정 범위를 남기세요. 앱에서 고친 부분과 서버에서 확인/수정한 부분을 구분하세요.
```

## 이 저장소의 수정 및 검증

작업 branch: `codex/fix-kfood-oct01-order-flows`. 다음은 로컬 변경이며 배포된 동작이 아니다.

- Orders canonical 응답의 주문/고객 메모 필드를 보존한다. 명시적으로 비운 메모는 빈 값으로 유지해 오래된 snapshot의 메모가 다시 나타나지 않게 한다.
- Add Order에서 배송일 없는 후보를 `Date pending`으로 표시하고 해당 필터를 제공한다. 주문일 없는 경우는 `No date`로 구분한다.
- 단일 Route와 All routes에 기존 상세 주문표를 재사용한다. All routes는 모든 child와 Unassigned를 포함하며, 상세 정보 조회와 child 경로 링크를 제공한다. 기존 경로 요약과 timeline을 유지하고 그룹 편집 엔진은 변경하지 않는다.
- 필터 포털은 문서 좌표를 사용한다. Polaris `s-button` host의 0 크기 대신 실제 레이아웃 wrapper를 측정한다. 실제 iframe fixture에서 첫 열기/두 번째 열기 모두 버튼 아래 6px에 위치하고 스크롤이 유지되는 것을 확인했다.
- Orders resource 요청은 새 Authorization 헤더를 오래된 body token으로 덮지 않는다. 완료된 session token의 자체 캐시를 제거하고 동시 발급 요청만 합친다. Shopify 토큰 검증은 유지한다.

최종 검증:

- `npm test`: 867/867 통과.
- `node --test app/features/orders/canonical-orders.test.js`: 16/16 통과.
- `npm run build`, `npm run typecheck`, `npm run check:public-urls`: 통과.
- 변경 JS/JSX/MJS 18개 ESLint 및 `git diff --check`: 통과.
- 독립 코드 검토: 남은 지적 없음.
- 로컬 실제 컴포넌트 fixture: 단일 경로 6행, All routes 다중 경로 전체 행, Unassigned 포함 42행, item disclosure, child 경로 링크 및 기존 summary 유지 확인.

운영 재배포, 운영 화면의 수정 후 검증, 기존 날짜 데이터 보정은 수행하지 않았다. 세션 만료 전체 원인의 제거를 주장하지 않으며 확인된 토큰 처리 결함을 수정한 범위다.
