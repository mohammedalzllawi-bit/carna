# Admin Dashboard

لوحة تشغيل مرتبطة بـ MongoDB عبر NestJS. الوظائف المنفذة حالياً:

- مؤشرات فعلية من قاعدة البيانات.
- إضافة وتعديل ونشر وأرشفة السيارات.
- بحث في سيارات الإدارة.
- إدارة المدن وتفعيلها أو إيقافها.
- حماية عمليات الكتابة بمفتاح خادمي لا يصل إلى المتصفح.
- Audit Log لكل إنشاء أو تعديل أو أرشفة.

الوحدات التالية موجودة في خريطة التطوير ولم تكتمل واجهات إدارتها بعد:

- Users, roles, KYC.
- Dealers and subscriptions.
- Vehicles and approvals.
- Auction sessions and live auctions.
- Bids and auction results.
- Payments, refunds, wallet ledger.
- Technicians and inspections.
- Ads.
- Support, complaints, disputes.
- Reports, content, settings, audit logs.

The dashboard owns dynamic settings for prices, fees, commissions, auction rules, anti-sniping, deposit rules, plans, cities, payment provider activation, and maintenance mode.
