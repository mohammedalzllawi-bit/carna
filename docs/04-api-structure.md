# API Structure

## Style

- REST API أولاً.
- Swagger/OpenAPI لكل endpoints.
- WebSocket namespace للمزادات المباشرة.
- Versioning من البداية: `/api/v1`.

## REST Routes

```text
/api/v1/auth
/api/v1/users
/api/v1/dealers
/api/v1/dealer-plans
/api/v1/vehicles
/api/v1/auctions
/api/v1/auction-sessions
/api/v1/bids
/api/v1/orders
/api/v1/payments
/api/v1/payment-webhooks
/api/v1/wallet
/api/v1/technicians
/api/v1/inspections
/api/v1/ads
/api/v1/notifications
/api/v1/reviews
/api/v1/disputes
/api/v1/support
/api/v1/content
/api/v1/settings
/api/v1/admin
```

## Module Shape

كل وحدة في Backend تتبع هذا الشكل:

```text
module/
  dto/
  entities-or-types/
  policies/
  repositories/
  module.controller.ts
  module.service.ts
  module.module.ts
```

## أمثلة endpoints حرجة

### Auctions

- `POST /auctions`: إنشاء مزاد.
- `POST /auction-sessions`: إنشاء مزاد موحد.
- `POST /auction-sessions/:id/vehicles`: إضافة سيارة لجلسة.
- `POST /auctions/:id/pause`: إيقاف.
- `POST /auctions/:id/resume`: استئناف.
- `POST /auctions/:id/complete`: إنهاء يدوي بصلاحية.

### Bids

- `POST /auctions/:id/bids/preview`: حساب ما سيدفعه المستخدم قبل الالتزام.
- `POST /auctions/:id/bids`: وضع مزايدة عبر REST fallback.
- Socket event: `auction:bid.place`.
- Socket event: `auction:bid.accepted`.
- Socket event: `auction:bid.rejected`.
- Socket event: `auction:state.updated`.

### Payments

- `POST /payments`: إنشاء دفع.
- `GET /payments/:id`: حالة الدفع.
- `POST /payments/:id/cancel`: إلغاء.
- `POST /payments/:id/refund`: استرداد بصلاحية.
- `POST /payment-webhooks/:provider`: استقبال Webhook.

## Response Principles

- كل أخطاء المزايدة ترجع سبب واضح وقابل للترجمة.
- كل عملية مالية ترجع breakdown كامل: price, fees, deposit, commission, total.
- لا يرجع API وثائق حساسة إلا عبر endpoint محمي وSigned URL.

