# KFood CLEVER K-Food 설치 메모

Date: 2026-06-29

## 결론

KFood store는 `shopify app dev` 대상이 아니다. 로컬 hot reload 개발은 CLEVER dev store에서 `CleverRoute Dev`로 하고, KFood 확인은 별도 Custom distribution 앱 `CLEVER K-Food`를 설치해서 진행한다.

## 확인된 store

- Store name: `K-Food Company`
- Store domain: `7hrud1-xq.myshopify.com`
- Admin URL hint: `https://admin.shopify.com/store/7hrud1-xq`

Read-only 확인 결과:

```json
{
  "shop": {
    "name": "K-Food Company",
    "myshopifyDomain": "7hrud1-xq.myshopify.com",
    "plan": {
      "displayName": "Shopify",
      "partnerDevelopment": false,
      "shopifyPlus": false
    }
  }
}
```

## 왜 `app dev`가 안 되는가

Shopify CLI `app dev --store`는 development store 또는 Shopify Plus sandbox store만 받는다. KFood는 `partnerDevelopment=false`, `shopifyPlus=false`라서 아래 에러가 정상이다.

```text
Could not find store for domain 7hrud1-xq.myshopify.com in organization CLEVER.
Ensure you have provided the correct store domain, that the store is a dev store, and that you have access to the store.
```

## 작업 원칙

- seed 생성 금지.
- KFood에서 `shopify app dev` 시도 금지.
- KFood에는 production `CLEVER`나 dev `CleverRoute Dev`가 아니라 KFood 전용 Custom 앱 `CLEVER K-Food`를 설치한다.
- 앱 서버 코드는 공유될 수 있지만 Shopify app identity/env/session DB는 KFood 전용으로 분리한다.
- 설치 후에는 Shopify app/session 및 delivery API 쪽 shop/sync 데이터가 생길 수 있다. 완전 무오염 확인은 불가능하다.

## 사용 앱

- Shopify config: `apps/shopify-app/shopify.app.kfood.toml`
- App name: `CLEVER K-Food`
- App handle: `clever-route-kfood`
- Public app URL: `https://clever-kfood-app.cleversystem.ai`
- Delivery API URL: `https://clever-route.cleversystem.ai`
- Expected app id: `clever-route-kfood`

## 사용자가 “KFood 설치해”라고 하면 할 일

1. `https://clever-kfood-app.cleversystem.ai/auth/login` smoke test가 통과했는지 확인한다.
2. Partner Dashboard에서 `CLEVER K-Food` 앱의 Custom distribution install link를 준비한다.
3. 대상 store domain은 아래만 사용한다.

```text
7hrud1-xq.myshopify.com
```

4. KFood Admin에서 install flow를 완료한다.
5. 설치 후 아래 URL로 embedded app 진입을 확인한다.

```text
https://admin.shopify.com/store/7hrud1-xq/apps/clever-route-kfood
```

대체 진입 URL:

```text
https://clever-kfood-app.cleversystem.ai/auth/login?shop=7hrud1-xq.myshopify.com
```

6. 확인 범위는 앱 로딩, 주문 read, delivery API 송수신까지만 한다. seed/order 생성/상품 생성은 하지 않는다.

## 로컬 개발은 여기서만

KFood가 아니라 CLEVER dev store에서 실행한다.

```bash
cd ~/Documents/Files/03_Work_EVnSolution/01_Repos/05_CLEVER_Shopify/shopify-clever/apps/shopify-app
export CLEVER_APP_ID=clever-route-dev
export CLEVER_DELIVERY_API_URL=https://clever-route.cleversystem.ai
export SHOPIFY_APP_DISTRIBUTION=single_merchant
npm run dev -- --store clever-test-syhae28n.myshopify.com
```

## KFood config release

실제 Client ID/API secret을 채운 뒤 명시적으로만 실행한다.

```bash
cd apps/shopify-app
npm run deploy:kfood -- --allow-updates --message "CLEVER K-Food initial custom config"
```

## CLEVER-test KFood JSON import note

- 2026-06-29: `/Users/jiin/Downloads/Kfood-orders.json` was imported into the CLEVER dev store only: `clever-test-syhae28n.myshopify.com`.
- Import marker: Shopify tag `clever-kfood-import`, custom attribute `CLEVER Import Source Order`.
- Current limitation: deleting orders/products in Shopify does **not** automatically remove or reconcile existing Clever delivery-api records. Treat Shopify deletion sync as a future explicit reconciliation feature, not current behavior.
