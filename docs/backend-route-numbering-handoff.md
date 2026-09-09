# 백엔드 전달 프롬프트

대상 디렉터리: `/Users/jiin/.codex/worktrees/routes-correction-2/clever-route-server`

```text
작업: 경로 표시 번호(routeIdx) 배정의 DB 집계·잠금 비용을 확인하고, 근거가 있는 최소 개선을 적용해주세요.

프런트 변경:
- Add Empty Route는 tempId로 로컬 초안을 즉시 추가하며 next-route-idx API를 호출하지 않습니다.
- 새 경로 Save payload는 routeIdx를 생략합니다. 자동 생성 초안 이름은 label:null, 사용자가 직접 수정한 이름은 label:<입력값>입니다.
- routeKey/tempId, orderIds, sortOrder, 기존 경로 routePlanId/routeIdx와 revision은 유지합니다.
- 최종 번호와 실제 경로 ID는 저장 응답을 따릅니다. 실제 routePlanId와 #123 표시 번호를 혼동하지 않습니다.
- 기존 그룹의 resolveNewChildRouteIdx(undefined, nextAvailableRouteIdx) 계약을 사용합니다. 일반 경로의 atomic split-save/Copy bridge 검토는 기존 작업을 보존해주세요.

확인한 코드(95b1152 기준):
- route-grouping.service.ts nextRouteIdx: 그룹 확인 후 nextGlobalRouteIdx 호출. 미리 조회한 번호를 예약하는 쓰기는 없습니다.
- nextGlobalRouteIdx: 상점 단위 pg_advisory_xact_lock, 전체 route_grouping_child_versions의 JSONB snapshot.routeIdx MAX와 COUNT 집계.
- saveDraft: 새 경로마다 같은 번호 계산을 반복합니다.
- resolveNewChildRouteIdx: 번호 생략 시 서버 배정, 지정한 번호가 달라지면 conflict.

범위:
1. 집계 쿼리의 실행계획/읽는 행 수와 잠금 대기 시간을 구분해서 확인해주세요. 아직 DB 집계가 실제 지연의 주원인이라고 측정된 것은 아닙니다.
2. 같은 저장에서 반복 집계를 줄일 수 있는지 우선 검토해주세요. 컬럼·인덱스·카운터 변경은 측정 근거와 번호 정책을 확인한 뒤 필요한 경우에만 선택해주세요.
3. 번호 중복 방지, 동시 저장, rollback, 기존 번호/이름 보존과 새 경로 여러 개 저장을 검증해주세요. max(routeIdx, version row count)+1이라는 기존 정책을 임의로 바꾸지 마세요.
4. routePlanId, 주문 정본, 완료 진행률, 원본/복사본 관계와 진행 중인 split-save bridge 변경을 보존해주세요.
5. 실제 운영 주문 변경, 자동 메시지, 병합·배포는 하지 마세요. 로컬 무거운 검사는 build-hygiene로 직렬 실행하고 전체 suite/build는 가능한 원격 CI를 사용해주세요.

완료 결과: 원인별 측정 근거, 최소 변경, 동시성/번호 배정 검증, PR/CI와 남은 위험을 해당 작업에 보고해주세요. 다른 대화를 검색하거나 자동 전달하지 마세요.
```
