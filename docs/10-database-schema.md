# Database Schema

مصدر الحقيقة الحالي لمخطط قاعدة البيانات موجود هنا:

```text
apps/api/prisma/schema.prisma
```

## المجالات المغطاة

- Users, Roles, Permissions, RBAC.
- User documents and refresh sessions.
- Dealers, dealer staff, plans, subscriptions.
- Vehicles, images, videos, documents, damage reports, immutable snapshots.
- Auctions, auction sessions, auction vehicles, bids, bid history, auction results.
- Orders, payments, payment transactions, providers, refunds.
- Wallet ledger.
- Technicians, technician services, inspection requests, inspection reports.
- Favorites, watchlists, saved searches.
- Notifications and templates.
- Support tickets and messages.
- Disputes and evidence.
- Reviews.
- Advertisement campaigns, placements, ads.
- Cities and regions.
- Dynamic settings, fees, commission rules.
- Audit logs and fraud alerts.
- Content pages, terms, policies.
- Promo codes and referrals.

## قواعد مهمة داخل المخطط

- `WalletLedger` append-only منطقياً؛ لا يتم تعديله من لوحة الإدارة مباشرة.
- `PaymentTransaction.providerEventId` فريد لمنع Webhook duplicate من إنشاء أثر مالي مكرر.
- `VehicleSnapshot` يحفظ نسخة بيانات السيارة عند بداية المزاد أو وقت المزايدة لحماية المستهلك.
- `AuctionResult` يحفظ الفائز، تحقق reserve، العربون، الرسوم، والمبلغ المتبقي.
- `deletedAt` يستخدم للحذف المنطقي في الجداول التي تحتاج أرشفة بدل حذف.

## بعد تثبيت الحزم

```bash
npm.cmd install
npm.cmd run prisma:validate --workspace @libya-auctions/api
npm.cmd run prisma:generate --workspace @libya-auctions/api
```

