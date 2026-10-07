# Roles And Permission Matrix

## الأدوار الأساسية

- `SUPER_ADMIN`: صلاحية كاملة وإعدادات النظام.
- `ADMIN`: إدارة تشغيلية واسعة بدون صلاحيات secrets أو حذف حساس.
- `SUPPORT_AGENT`: دعم، تذاكر، نزاعات ضمن حدود.
- `AUCTION_MANAGER`: إدارة المزادات والسيارات داخل المزاد.
- `FINANCE_MANAGER`: المدفوعات، refunds، ledger، التقارير المالية.
- `CONTENT_MANAGER`: الصفحات، FAQ، السياسات، الإعلانات.
- `DEALER_OWNER`: مالك معرض.
- `DEALER_STAFF`: موظف معرض.
- `TECHNICIAN`: فني فحص.
- `CUSTOMER`: مستخدم عادي.
- `SUSPENDED`: حساب محدود.

## Matrix مختصر

| Permission | Customer | Dealer Owner | Dealer Staff | Technician | Support | Auction Manager | Finance | Admin | Super Admin |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| auth.login | yes | yes | yes | yes | yes | yes | yes | yes | yes |
| vehicles.read_public | yes | yes | yes | yes | yes | yes | yes | yes | yes |
| vehicles.create_own | yes | yes | yes | no | no | yes | no | yes | yes |
| vehicles.submit_review | yes | yes | yes | no | no | yes | no | yes | yes |
| vehicles.approve | no | no | no | no | no | yes | no | yes | yes |
| auctions.bid | yes | yes* | yes* | yes | no | no | no | no | no |
| auctions.manage | no | no | no | no | no | yes | no | yes | yes |
| auctions.pause_resume | no | no | no | no | no | yes | no | yes | yes |
| dealers.create | yes | yes | no | no | no | no | no | yes | yes |
| dealers.approve | no | no | no | no | no | no | no | yes | yes |
| subscriptions.manage_own | no | yes | no | no | no | no | no | yes | yes |
| payments.create | yes | yes | yes | yes | no | no | yes | yes | yes |
| payments.refund | no | no | no | no | no | no | yes | yes | yes |
| wallet.read_own | yes | yes | yes | yes | no | no | yes | yes | yes |
| inspections.request | yes | yes | yes | no | no | no | no | yes | yes |
| inspections.perform | no | no | no | yes | no | no | no | yes | yes |
| disputes.create | yes | yes | yes | yes | yes | no | no | yes | yes |
| disputes.decide | no | no | no | no | limited | no | no | yes | yes |
| ads.buy | no | yes | no | no | no | no | no | yes | yes |
| ads.manage | no | own | no | no | no | no | no | yes | yes |
| settings.manage | no | no | no | no | no | no | no | limited | yes |
| audit.read | no | no | no | no | limited | limited | limited | yes | yes |

`yes*`: يسمح بالمزايدة فقط إذا لم يكن المستخدم مالك السيارة أو مرتبطاً بالمعرض/السيارة، ولم يكن محظوراً أو تحت مراجعة تمنع المزايدة.

## قواعد إضافية

- RBAC يحدد ما يمكن طلبه، وPolicy Guards تحدد هل يمكن تنفيذه على المورد المحدد.
- أي تغيير إداري ينتج `AuditLog`.
- الحساب `SUSPENDED` لا يمكنه المزايدة أو الدفع أو إضافة سيارات.
- الوثائق الحساسة تتطلب permission منفصلة وSigned URLs قصيرة العمر.

