# Shopify app Prisma migration runbook

## 목적

Shopify app의 SQLite schema 변경을 애플리케이션 시작과 분리하고, 검증되지 않은
migration이 production 컨테이너 교체까지 진행되지 않게 한다.

현재 datasource와 영속 볼륨의 계약은 다음과 같다.

- Prisma provider: SQLite
- schema datasource: `file:../data/dev.sqlite`
- container path: `/app/data/dev.sqlite`
- host path: deploy target별 `sqlite-path`

Compose는 SQLite file이 아니라 `/app/data` directory 전체를 mount한다. rollback journal,
WAL, SHM 등 SQLite sidecar도 같은 persistent directory에 남겨야 하므로 file-only mount로
되돌리지 않는다. datasource URL과 compose volume의 container path는 함께 변경해야 한다.

## 개발 절차

1. `schema.prisma`를 변경한다.
2. 개발 DB에서 migration을 생성한다.

   ```bash
   cd apps/shopify-app
   npm exec prisma migrate dev -- --name <change-name>
   ```

3. 생성된 `prisma/migrations/<timestamp>_<change-name>/migration.sql`을 검토한다.
   다음 위험 SQL이 포함되면 같은 migration directory에 `risk-review.md`를 추가한다.

   - table rewrite (`RedefineTables`)
   - table/column rename
   - default 없는 required column 추가
   - unique constraint/index 추가
   - table/column/index/constraint 삭제

   ```text
   issue: https://github.com/EVNSolution/shopify-clever/issues/<number>
   backup: <검증된 snapshot 또는 application-consistent backup 식별값>
   rehearsal: <production 크기·조건의 사본에서 실행한 결과>
   backward-compatible: yes
   recovery: <실패 시 복구 절차>
   ```

   `pending`, `none`, `n/a` 같은 placeholder는 CI가 거부한다.
4. 전체 migration history를 빈 임시 SQLite에 replay한다.

   ```bash
   npm run prisma:migrate:check
   ```

5. 앱 테스트, build, typecheck를 실행한다.

이미 공유 또는 production에 적용된 migration 파일을 수정하거나 삭제하지 않는다.
schema 변경에는 migration directory를 같은 PR에 포함해야 한다.

## 자동 검증

`npm run prisma:migrate:check`는 저장소 밖의 임시 directory에서 다음을 수행하고
항상 임시 DB를 삭제한다.

1. schema validation
2. 위험 migration의 `risk-review.md` 계약 확인
3. 빈 SQLite에 전체 `migrate deploy`
4. `migrate status`로 history 확인
5. replay 결과와 `schema.prisma`의 `migrate diff --exit-code` 비교

이 검증은 migration SQL 오류와 schema/migration 누락을 production 전에 차단한다.

## production release 순서

수동 `Deploy Shopify app` workflow만 production migration을 실행한다.

1. 동일 SHA의 main CI 성공 여부 확인
2. source sync 및 새 image build
3. SQLite path의 읽기·쓰기 권한 확인
4. 새 image의 one-shot container로 `prisma migrate deploy`
5. one-shot container로 `prisma migrate status`
6. live SQLite와 schema의 drift 검사
7. 모든 검사가 성공한 경우에만 `docker compose up -d`로 앱 교체
8. endpoint smoke test

4~6단계가 실패하면 새 앱 컨테이너로 교체하지 않는다. 다만 migration은 이미 live
DB를 일부 또는 전부 변경했을 수 있으므로, 기존 컨테이너의 안전은 backward-compatible
migration 설계에 달려 있다. 앱 컨테이너의 일반 시작과 재시작은 migration을 적용하지
않고 status와 drift만 확인한다.

Migration은 앱 교체보다 먼저 DB를 변경하므로 production 변경은 반드시
backward-compatible한 expand/contract 순서를 사용한다. 예를 들어 필수 column은
nullable 또는 default가 있는 상태로 먼저 추가하고, data backfill과 구 코드 제거 후
별도 release에서 제약을 강화한다.

## 실패 대응

1. 같은 migration을 반복 실행하기 전에 deploy log와 `prisma migrate status` 결과를
   보존한다.
2. 새 서비스가 교체되지 않았는지 compose 상태를 확인한다.
3. migration SQL의 어느 단계까지 반영됐는지 확인한다.
4. 아래 두 복구 경로 중 하나를 별도 GitHub issue와 검증 기록 아래 수행한다.

- 변경을 되돌린 뒤 `prisma migrate resolve --rolled-back <migration>`로 기록하고,
  수정된 forward migration을 다시 배포한다.
- migration의 남은 작업을 DB에 정확히 완료한 뒤
  `prisma migrate resolve --applied <migration>`로 기록한다.

production에서는 다음 명령을 사용하지 않는다.

- `prisma migrate reset`
- `prisma db push`
- `_prisma_migrations` 직접 수정
- SQLite 파일 삭제 또는 빈 파일로 교체

`migrate resolve`는 자동화하지 않는다. 데이터와 실제 반영 상태를 사람이 확인해야
하는 복구 명령이다.

## 자동화의 한계

- 빈 DB replay는 production 데이터 때문에 발생하는 unique/NOT NULL 충돌을 미리
  재현하지 못한다.
- deploy 후 drift 검사는 수동 schema 변경을 감지하지만, 실패한 migration을 자동으로
  되돌리지는 않는다.
- 실행 중인 SQLite 파일을 단순 `cp`하는 것은 일관된 backup을 보장하지 않으므로
  deploy action에서 임의 복사하지 않는다.

따라서 table rewrite, column 삭제, 필수·unique 제약 추가 또는 data migration이 있는
release는 배포 전에 application-consistent SQLite backup이나 EC2/EBS snapshot을
확보하고, production과 동등한 데이터 사본에서 migration을 rehearsal해야 한다.

## 공식 근거

- [Development and production](https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/development-and-production)
- [Deploying database changes with Prisma Migrate](https://docs.prisma.io/docs/orm/v6/prisma-client/deployment/deploy-database-changes-with-prisma-migrate)
- [Patching and hotfixing](https://docs.prisma.io/docs/orm/prisma-migrate/workflows/patching-and-hotfixing)
- [`prisma migrate resolve`](https://docs.prisma.io/docs/cli/migrate/resolve)
