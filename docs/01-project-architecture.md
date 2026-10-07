# Project Architecture

## الهدف

بناء منصة API-first قابلة للتوسع لإدارة مزادات السيارات، سيارات المعارض، البيع السريع، الفحص، الدفع، الإعلانات، الشكاوى، ولوحة الإدارة. كل العمليات الحساسة تنفذ في Backend، بينما Web وFlutter وAdmin هي طبقات عرض فقط.

## Monorepo

```text
apps/api      NestJS API, WebSocket Gateway, Workers, Prisma
apps/web      Next.js public web platform
apps/admin    Next.js admin dashboard
apps/mobile   Flutter application
packages/shared-types       DTO-like shared TypeScript contracts
packages/shared-validation  Shared validation schemas for web/admin
```

## Backend

- NestJS + TypeScript.
- MongoDB Replica Set + Prisma. تحفظ القيم المالية كـ `BigInt` بوحدة جزء الألف من LYD.
- Redis للـ cache وauction state وrate limit.
- Socket.IO للمزايدة المباشرة.
- BullMQ للمهام المؤجلة: انتهاء المزاد، إشعارات، Webhook retries، ضغط الصور.
- Object Storage للصور والوثائق.
- Swagger/OpenAPI للعقود.

## Frontend

- Web: Next.js + TypeScript + RTL.
- Admin: Next.js + TypeScript بتجربة تشغيلية كثيفة وواضحة.
- Mobile: Flutter feature-based architecture مع Riverpod أو Bloc.

## مبادئ أساسية

- Dynamic settings: لا توجد أسعار أو نسب ثابتة داخل الكود.
- Audit-first: كل عملية مؤثرة تسجل.
- Soft delete للأشياء القابلة للإخفاء، وأرشفة للسجلات المالية والمزايدات.
- Payment adapters: كل مزود دفع يطبق interface مستقل.
- RBAC + ownership checks: الدور وحده لا يكفي؛ يجب التحقق من ملكية المورد وسياق العملية.
- Localization-ready: النصوص الثابتة في الواجهات تستخدم translation keys، ومحتوى الصفحات قابل للتحرير من الإدارة.

## Boundaries

- `Auth`: تسجيل، دخول، Refresh rotation، توثيق هاتف، جلسات.
- `Users`: المستخدمون، KYC، الوثائق، الحظر.
- `Dealers`: المعارض، الموظفون، الاشتراكات، الاعتماد.
- `Vehicles`: السيارات، الصور، الفيديو، الأضرار، المراجعة.
- `Auctions`: الجلسات، السيارات داخل الجلسة، الحالات.
- `Bids`: المزايدة atomic، سجل المزايدات، WebSocket events.
- `Payments`: أوامر الدفع، المعاملات، Webhooks، refunds.
- `Wallet`: ledger داخلي غير قابل للتعديل المباشر.
- `Inspections`: الفنيون، طلبات الفحص، التقارير.
- `Ads`: الحملات والمواضع.
- `Support`: التذاكر والمحادثات.
- `Disputes`: النزاعات والأدلة والقرار.
- `Admin`: أدوات إدارة عابرة للوحدات.
- `Settings`: قواعد ديناميكية، fees، commissions، content.
