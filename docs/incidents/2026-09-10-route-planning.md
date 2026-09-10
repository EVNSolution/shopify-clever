# 2026-09-10 K-food 경로 생성·저장 오류

사용자 화면을 재현 근거로 사용했다. 운영에서 Create/Save를 다시 실행하지 않았고,
로그 및 `BEGIN READ ONLY` PostgreSQL 조회로 아래 상태를 확인했다. 주문·경로 데이터는 변경하지 않았다.

## 확인한 원인

- K-food 웹 실행 SHA: `15232582f21906a7dd1446da40bdd93b0348d2bb`.
- Delivery API 실행 이미지 revision: `a92ae035fa1b941c7f31e41fd1e2ea96be66630e`.
- 앱/스토어 범위: `clever-route-kfood`, `7hrud1-xq.myshopify.com`.
- 일반 Route 생성: `POST /admin/route-plans` 400 `ROUTE_PLAN_BATCH_INVALID`.
  correlation ID `25b51fc3-d77b-46fd-8154-cf9a2a47b613`.
  새 그룹에 들어간 동일한 목요일 Delivery 41건은 모두 같은 날짜·scope이고,
  40건은 `READY_TO_PLAN`, 주문 `#1908` 한 건은 `cancelled_order`였다.
  `#1908`은 2026-09-03 16:36:30 UTC에 취소됐고 `VOIDED / UNFULFILLED` 상태다.
  따라서 이번 실패를 mixed route scope나 좌표 오류로 설명하면 안 된다.
- 새 그룹 분할 저장: `PATCH /admin/route-groups/:routeGroupId/draft` 409
  `ROUTE_GROUPING_STALE_WRITE`, correlation ID `7fb78594-ae4d-419d-abc1-65a242fc0f3f`.
  서버가 받은 분할은 `[18, 23, 0]`의 임시 route 3개로 총 41건이다.
  새 그룹 `02edfb64-31fe-4f12-9dca-c184fad32cc5`의 41건 모두
  `currentRouteVersionId=8056cf0d-d490-4c96-9c0f-d57da3878863`을 유지한다.
  이 버전은 이전 그룹 `6cf7650f-31b9-46c2-bded-0827cf0306e9` 소속이며
  `ARCHIVED`, `routePlanId=NULL`이다. 해당 이전 버전에 연결된 주문은 총 42건이다.
  새 그룹 저장 시 다른 그룹 소유권을 차단하는 guard가 이 폐기된 연결까지 거절한다.
  실행 SHA의 `route-plan.repository.ts:1338` 삭제 트랜잭션과 `:2597` 참조 제거,
  `:2611` 분할 해제, `route-grouping.service.ts:4832` 삭제 이력 생성 경로에서
  주문 연결 해제가 빠져 있음을 확인했다.
- 이전 화면의 42건/41 Stops 문제는 별개다. 이전 그룹에만 있는 추가 주문은
  `#2019`이며 배송일·배송 scope가 없다. 웹은 남는 그룹 주문을 `Unassigned`로
  표시하지만 draft 요청에서는 제외한다. 서버는 모든 그룹 주문을 `routes`와
  `removedOrderIds`에 정확히 한 번씩 요구하므로 해당 상태의 Save는 partition 오류가 난다.
  `removedOrderIds`에 자동 삽입하면 그룹에서 주문이 제거되므로 해결책으로 사용하지 않는다.

## 현재 저장소 수정 범위

취소 주문을 Orders에 취소선 행으로 남기고 체크박스를 비활성화했다. 일반 선택,
현재 페이지 전체 선택, 지도 팝업 추가에서 제외하며, 갱신 전 선택은 최신 행으로 다시 판정한다.
전체 필터 선택에 넘긴 취소 주문 제외 목록도 후속 선택 변경에서 유지한다.
오래된 선택이나 직접 제출은 웹 BFF의 공유 검증에서 거절하므로
일반 Route, Group Route, 기존 Route 추가에 모두 적용된다. 주문 조회 및 Shopify 원본은 유지한다.
Save 오류의 소유권 복구 및 그룹 Unassigned 계약은 별도 서버 저장소 범위다.
웹 검사만으로 기존 409 오류가 복구됐다고 보고하지 않는다.

## 서버 작업용 전달문

대상 디렉터리:
`/Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/04_CLEVER_Route/clever-route-server`

```text
K-food Create Group Route 후 폴리곤 Save가 ROUTE_GROUPING_STALE_WRITE로 실패하는 문제를 수정해 주세요.
웹 측에서 운영 로그와 READ ONLY DB 조회로 원인을 확인했으므로 운영에서 같은 생성/저장 조작을 반복할 필요는 없습니다.

실행 기준은 API image revision a92ae035fa1b941c7f31e41fd1e2ea96be66630e입니다.
새 그룹 02edfb64-31fe-4f12-9dca-c184fad32cc5의 41건 모두 currentRouteVersionId가
8056cf0d-d490-4c96-9c0f-d57da3878863으로 남아 있습니다. 이 버전은 이전 그룹
6cf7650f-31b9-46c2-bded-0827cf0306e9 소속 ARCHIVED 버전이며 routePlanId가 NULL입니다.
현재 그 버전에 묶인 주문은 총 42건입니다. 앱/샵은 clever-route-kfood / 7hrud1-xq.myshopify.com입니다.

route-plan.repository.ts의 deleteRoutePlan, clearRouteGroupingChildVersionRoutePlanRefs,
collapseRouteGroupingSplitAfterChildDelete와 route-grouping.service.ts의
archiveDeletedRouteGroupingChildMembership을 확인하세요. 실행 SHA의 삭제 경로는
child 이력 보존 및 routePlan 참조 제거 후에도 orders.currentRouteVersionId를 해제하지 않습니다.
rebindCurrentOrdersToRouteVersion의 다른 활성 그룹 소유권 보호는 유지하세요.
삭제/분할 해제 트랜잭션에서 정확히 폐기되는 버전에 묶인 주문만 해제하고,
이미 다른 최신 버전으로 옮겨진 주문은 보존하도록 수정해 주세요.
기존 잔여 데이터 복구는 해당 앱/샵/그룹/버전으로 한정한 dry-run과 영향 건수,
복구·rollback 계획을 먼저 준비해 주세요. 넓은 currentRouteVersionId NULL 처리는 금지입니다.

추가로 이전 그룹은 42건이고 child에는 41건만 있었습니다. 추가 주문 #2019는 배송일/scope 미정입니다.
웹의 Unassigned 주문을 draft가 생략하는 반면 서버는 routes + removedOrderIds 전량 분할을 요구합니다.
Unassigned 보존 계약과 기존 클라이언트 호환성을 정리하세요. 자동 removedOrderIds 추가는 그룹 주문 삭제이므로 금지입니다.
createGrouping이 취소 주문도 허용하는 서버 측 검증 차이도 수정하세요.
일반 Route 생성 실패의 직접 원인은 #1908 cancelled_order이며, 웹에서는 해당 주문 선택 차단을 로컬 수정했습니다.
Orders 취소 행은 사용자의 요청대로 목록에 취소선을 적용해 유지하며 선택은 불가합니다.
order-query.repository.ts createSelectionSnapshot은 전체 필터 집합의 id만 저장하므로
취소 주문이 다른 페이지에 있어도 선택 인원수에 들어갈 수 있습니다. 전체 필터 선택에서도
취소 주문을 제외하되 Orders 조회 목록에서는 유지하고, 기존 snapshot에도 동일 규칙을 적용하세요.
현재 snapshot Action 적용 단계에는 cancelledAt skip이 있으나 선택 집합/건수 자체의 제외와는 다릅니다.

검증: 삭제/분할 해제 후 새 그룹 생성·18/23/0 분할 저장, archived 잔여 연결,
정상 활성 타 그룹 소유권 보호, 이미 새 버전에 연결된 주문 보존,
그룹 42건/child 41건의 Unassigned 보존, 취소 주문 유입 방지 회귀 테스트.
Shopify 원본 주문·고객 변경, DSV 변경, 불필요한 알림 발송은 범위 밖입니다.
코드·테스트 결과와 기존 데이터 복구 필요 여부를 분리해서 보고해 주세요.
```

Control-plane preflight는 실제 `00_CLEVER_Agent/clever-agent-project`에서 통과했다.
이번 건은 기존 동작의 결함 수정이며 제품 요구사항 변경이 아니다. 별도 control-plane 저장소는
수정하지 않았다. 서버 구현/복구 및 배포 여부는 별도 확인이 필요하다.

## 로컬 검증

- `npm test`: 732/732 통과.
- `order-filters.test.js`, `i18n.test.js`: 추가 27/27 통과.
- `npm run build`, `npm run typecheck`, `npm run check:public-urls`: 통과.
- 변경 JS/JSX 및 테스트 파일 ESLint, `git diff --check`: 통과.
- 전체 lint는 기존 `app/routes/app.drivers-vehicles.jsx:653`의 `process` no-undef 1건으로 실패.
  기준 SHA에도 같은 코드가 있으며 이번 수정 범위에서는 변경하지 않았다.
- 배포 및 운영 데이터 복구는 실행하지 않았다. 새 그룹의 기존 Save 409와 아직 읽지 않은
  다른 페이지의 frozen selection 취소 주문 집계는 서버 후속 작업으로 남아 있다.
