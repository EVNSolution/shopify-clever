# AGENTS.md

## 이 파일의 역할

이 파일은 프로젝트 기획서가 아니다.

이 파일은 `shopify-clever` target repo에서 agent가 작업할 때 따라야 하는
실행 절차서다. 제품 설명, 미정 요구사항, 장기 기획은 별도 문서에 두고,
여기에는 repo 운영·검증·배포 규칙만 둔다.

## 프로젝트 연결값

- project-start issue: `pending`
- change-control issue: `pending`
- target repo: `EVNSolution/shopify-clever`
- repository visibility: `private`
- target service: `shopify-clever`
- app roots:
  - `apps/shopify-app` — Shopify embedded admin app, React Router
  - - template lineage: `clever Shopify monorepo / React Router Shopify app + Fastify delivery API / AWS single-EIP EC2`
- default integration branch: `main`
- production deploy mode: manual GitHub Actions `Deploy Shopify app`
  `workflow_dispatch` with `target=production`

값이 아직 확정되지 않은 항목은 `pending`으로 남기고, 추측해서 채우지 않는다.

## CLEVER 3대 repo control-plane

이 저장소는 구현 대상 repo다. 작업 방식은 CLEVER 3대 repo를 기준으로 맞춘다.

- 시작과 bootstrap 정본: `clever-agent-project`
- 승인과 추적 정본: `clever-change-control`
- 해석과 장기 context 정본: `clever-context-monorepo`

현재 로컬 checkout 기준 위치:

```text
/Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/00_CLEVER_Agent/
  clever-agent-project/
  clever-change-control/
  clever-context-monorepo/
```

사용자 메모에 `03_CLEVER_Agent`가 등장하더라도, 실제 로컬 workspace가
`00_CLEVER_Agent`라면 실제 경로를 우선 확인한다. 세 repo 중 하나가 없으면
웹 링크나 기억으로 대체하지 말고 로컬 context 불완전 상태로 보고한다.

## Preflight Gate

새 이슈, PR, ruleset, GitHub admin 설정, 배포 전략 변경처럼 traceability가 필요한
작업을 시작하기 전에는 control-plane preflight를 먼저 확인한다.

control-plane workspace의 `clever-agent-project`에서 실행한다.

```bash
python3 scripts/bootstrap_clever_work.py --cwd "$PWD" --preflight --json
```

repo visibility 변경, ruleset/branch protection 변경, repo 생성/삭제처럼 GitHub
admin 권한이 필요한 일은 destructive 변경 전에 admin preflight를 별도로 통과한다.

```bash
python3 scripts/bootstrap_clever_work.py \
  --cwd "$PWD" \
  --admin-preflight \
  --target-repo-full-name EVNSolution/shopify-clever \
  --json
```

이 저장소는 private repo 전략을 따른다. GitHub Free 조직의 private repo 제약
때문에 public repo용 ruleset 가정을 그대로 적용하지 않는다. repo 공개 전환,
branch protection/ruleset enforce, production 배포 방식 변경은 명시 지시 없이
진행하지 않는다.

## 작업 시작 순서

새 세션 또는 새 작업을 시작하면 아래 순서로 진행한다.

1. `git status --short --branch`로 branch와 dirty 상태를 확인한다.
2. `README.md`, 이 `AGENTS.md`, 관련 app 하위 `AGENTS.md`를 확인한다.
3. 작업이 비사소한 개발/배포 변경이면 target issue와 change-control issue가
   필요한지 판단하고, 필요하면 `clever-change-control`에 trace를 남긴다.
4. branch는 작업 유형 접두사를 포함한다.
5. 코드 변경 전 재현 또는 실패 테스트를 먼저 확보한다.
6. 변경 범위와 검증 방법을 짧게 정리한다.
7. 구현 또는 문서 변경을 수행한다.
8. 완료 주장 전 필수 검증을 실행하고 결과를 읽는다.
9. context monorepo 반영 필요 여부를 확인한다.
10. 완료 보고에 변경 파일, 검증 결과, 남은 리스크를 남긴다.

## Branch 운영

- `main`: 현재 CI 기준 및 production deploy source branch다.
- task branch: 이슈 또는 작업 단위 branch다.

브랜치 이름은 작업 유형 접두사를 포함한다.

예:

```text
docs/agent-workflow-gitignore
fix/shopify-dev-stale-bundle-smoke
feat/aws-deploy-hardening
ci/manual-production-dispatch
deploy/ec2-single-eip-followup
refactoring/delivery-api-boundary
test/shopify-route-smoke
```

규칙:

- `main`에 직접 push하지 않는다.
- private repo 전략상 production 배포는 push 자동 배포가 아니라 수동
  `Deploy Shopify app` workflow의 `target=production`으로만 실행한다.
- 오래된 별도 EC2 `clever-shopify-app` 또는 `43.201.116.245`가 남아 있어도
  명시 지시 없이 terminate/delete 하지 않는다.
- 내부 agent/tool 이름을 public commit, PR 제목, merge commit, GitHub
  attribution에 불필요하게 노출하지 않는다.

## Shopify local dev smoke gate

최근 `shopify app dev`에서 `/app/orders` 접근 시 React Router invariant
`Application Error`가 보고됐지만, 사용자가 브라우저/Shopify/Vite cache 삭제 후
재현되지 않는다고 보고했다.

따라서 같은 증상이 다시 보이기 전에는 코드 수정 금지. 먼저 상태 확인과 smoke
test만 수행한다.

### 상태 확인

```bash
git status --short --branch
ps -eo pid,ppid,command | grep -E 'shopify app dev|react-router dev|cloudflared' | grep -v grep
lsof -nP -iTCP -sTCP:LISTEN | grep -E 'node|cloudflared|:3000|:5173|:3457'
```

`shopify app dev` 또는 `react-router dev` 프로세스의 `PWD`, `INIT_CWD`,
`npm_config_local_prefix`가 현재 checkout 경로와 다르면 stale dev process로 본다.
이 경우 코드를 수정하지 말고 프로세스를 종료한 뒤 현재 repo에서 재시작한다.

```bash
cd apps/shopify-app
npm run dev
```

### Smoke test

Shopify CLI가 동적 port를 사용하므로 로그의 React Router local URL 또는 proxy
port를 확인한 뒤 실행한다.

```bash
curl -sS -o /tmp/orders.html -w '%{http_code}\n' http://localhost:<port>/app/orders
curl -sS -o /tmp/settings.html -w '%{http_code}\n' http://localhost:<port>/app/settings
grep -Ei 'Application Error|Could not resolve module ID|invariant|Internal Server Error' /tmp/orders.html /tmp/settings.html
```

직접 curl에서 인증/embedded context 부족으로 `410` 또는 auth 관련 응답이 나올 수
있다. 이 smoke의 1차 목적은 iframe 경로에서 stale bundle, missing route module,
React Router invariant, Vite module resolution error가 재현되는지 확인하는 것이다.

재시작 후 `/app/orders`, `/app/settings`에서 위 error signature가 사라지면
캐시 또는 stale dev process 문제로 정리하고 코드 수정하지 않는다. 캐시 삭제와
fresh dev process 이후에도 동일 증상이 재현될 때만 실패 테스트를 먼저 작성하고
구현으로 내려간다.

## Public URL / Shopify 설정 규칙

Shopify 설정상 public URL hostname에 `shopify` 또는 `example` 단어를 넣지 않는다.
현재 계열은 아래처럼 `clever-route-app`, `clever-route-api`를 사용한다.

- App URL: `https://clever-route-app.cleversystem.ai`
- Redirect URL: `https://clever-route-app.cleversystem.ai/auth/callback`
- Delivery URL: `https://clever-route-api.cleversystem.ai`

URL 변경 시 반드시 실행한다.

```bash
npm run check:public-urls
```

## GitHub Actions / private repo 전략

이 repo는 `EVNSolution/shopify-clever` private repo로 유지한다.

Known baseline:

- `origin/main` baseline commit: `f454dea Keep CI actions on supported runtimes`
- recent successful GitHub Actions run: `25843346995`

최신 상태가 필요한 보고에서는 위 값을 기억으로 단정하지 말고 `git ls-remote`,
`gh run view`, `gh run list`로 다시 확인한다.

Private GitHub-hosted Actions는 org quota를 소모하므로 workflow 전략은 가볍게
유지한다.

- PR과 `main` push: install, build, typecheck, tests, public URL hostname guard,
  compose config validation만 자동 실행한다.
- deploy: 검증을 통과한 `main`에서 수동 `Deploy Shopify app`
  `workflow_dispatch`의 `target`을 `production`, `clever-route`, `kfood` 중 하나로
  선택할 때만 실행한다. 배포 workflow는 동일 SHA의 install/build/test를 반복하지 않는다.
- private repo의 GitHub deployment environment/protection 제약을 우회하려고
  자동 production push deploy를 추가하지 않는다.
- production image build는 GitHub runner가 아니라 EC2 host에서 수행한다.

## AWS / EC2 production target

현재 통합 배포 대상:

- Instance: `i-0133358f86590294f`
- EIP: `3.39.216.177`
- Host deploy root: `/srv/shopify-clever`
- App URL: `https://clever-route-app.cleversystem.ai`
- Redirect URL: `https://clever-route-app.cleversystem.ai/auth/callback`
- Delivery URL: `https://clever-route-api.cleversystem.ai`

Runtime env files are not committed:

- `infra/env/shopify-app.env`

Required GitHub variables:

- `EC2_HOST`
- `EC2_USER`
- `DEPLOY_PATH`

Required GitHub secret:

- `EC2_SSH_KEY`

## 검증 명령

코드 변경 전에는 변경 범위에 맞는 가장 작은 검증부터 실행한다. 완료 주장 전에는
필요한 검증 결과를 새로 수집한다.

Shopify app scoped:

```bash
cd apps/shopify-app
node --test tests/*.test.mjs
npm run build
npm run typecheck
```

Repo root:

```bash
npm test
npm run check:public-urls
npm run build
npm run typecheck
```

Compose 관련 변경 시:

```bash
cp infra/env/shopify-app.env.example infra/env/shopify-app.env
docker compose -f infra/compose/docker-compose.shopify-main.yml config --quiet
```

## Lore Commit Protocol

커밋 메시지는 왜 변경했는지를 첫 줄에 쓴다. 필요한 경우 아래 trailer를 사용한다.

```text
<intent line: why the change was made, not what changed>

Constraint: <external constraint that shaped the decision>
Rejected: <alternative considered> | <reason for rejection>
Confidence: <low|medium|high>
Scope-risk: <narrow|moderate|broad>
Directive: <forward-looking warning for future modifiers>
Tested: <what was verified>
Not-tested: <known gaps in verification>
```

## 완료 조건

작업 완료 전 아래를 확인한다.

- 의도한 파일만 변경됐다.
- Shopify iframe Application Error는 재현 여부를 먼저 확인했고, 재현 전 코드 수정은
  하지 않았다.
- 필요한 테스트와 build/typecheck/public URL guard를 실행했다.
- production deploy 방식이 manual dispatch 전략을 깨지 않는다.
- context monorepo 또는 change-control 반영 필요 여부를 확인했다.
- 완료 보고는 한국어로 간결하게 작성하고, 검증 evidence와 남은 리스크를 포함한다.

## 금지 사항

- `AGENTS.md`를 프로젝트 기획서나 회의록으로 사용하지 않는다.
- public URL hostname에 `shopify` 또는 `example`을 넣지 않는다.
- 재현되지 않은 Shopify iframe 오류를 추측으로 코드 수정하지 않는다.
- 명시 지시 없이 기존 EC2 instance, EIP, runtime env, secret, GitHub repo
  visibility를 삭제/변경하지 않는다.
- 사용자가 만들었을 수 있는 변경을 임의로 되돌리지 않는다.
