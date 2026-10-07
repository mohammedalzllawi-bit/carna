# Auction Flow

## States

```text
Scheduled -> Live -> Payment Pending -> Sold
Scheduled -> Cancelled
Live -> Paused -> Live
Live -> Completed -> No Winner
Live -> Completed -> Payment Pending
Payment Pending -> Sold
Payment Pending -> Relisted
Payment Pending -> Pending Expired
```

## إنشاء المزاد

1. Admin أو Auction Manager يحدد السيارة والقواعد.
2. النظام يتحقق من اعتماد السيارة والمعرض والاشتراك/العمولة.
3. يتم حفظ `Auction`.
4. عند الربط بجلسة مزاد موحد يتم إنشاء `AuctionVehicle` مع ترتيب السيارة.
5. قبل بداية المزاد يتم أخذ `VehicleSnapshot`.

## وضع مزايدة

1. التحقق من JWT والجلسة.
2. التحقق من حالة المستخدم: غير محظور، KYC إذا مطلوب، ليس تحت منع مزايدة.
3. التحقق من أن المزاد Live.
4. التحقق من أن السيارة غير ملغاة ولا عليها نزاع يمنع البيع.
5. منع صاحب السيارة أو حساب مرتبط بالمعرض من المزايدة.
6. التحقق من الحد الأدنى: `currentHighest + bidIncrement`.
7. تنفيذ العملية داخل MongoDB multi-document transaction على Replica Set.
8. إنشاء `Bid` و`BidHistory`.
9. تحديث `Auction.currentBidAmount`, `bidCount`, `highestBidderId`.
10. تطبيق Anti-Sniping إذا كانت المزايدة داخل النافذة المحددة.
11. نشر WebSocket event لكل المشاهدين.
12. إرسال Notification للمستخدم الذي تم تجاوزه.

## Atomicity

يجب أن تستخدم خدمة المزايدة:

- Database transaction.
- تحديث ذري داخل transaction مع إعادة المحاولة عند تعارض الكتابة.
- unique/idempotency key اختياري عند تكرار الطلب من العميل.
- مقارنة وقت النهاية داخل transaction، لا في Frontend.

## انتهاء المزاد

1. Worker يفحص المزادات المنتهية.
2. إذا لا توجد مزايدات: `No Winner`.
3. إذا أعلى مزايدة أقل من Reserve: `Completed` مع `reserveMet=false` أو `No Winner` حسب إعداد المزاد.
4. إذا reserve متحقق: إنشاء `AuctionResult`.
5. إنشاء `Order` للعربون.
6. حساب رسوم المنصة والشراء والعربون من قواعد Dynamic.
7. الحالة تصبح `Payment Pending`.
8. إشعار الفائز والمعرض والإدارة.

## حالات يجب اختبارها

- مزايدتان في نفس اللحظة.
- مزايدة تصل وقت انتهاء المزاد.
- WebSocket انقطع واستعمل REST fallback.
- فائز لم يدفع.
- دفع مكرر.
- حظر المستخدم أثناء المزاد.
- إلغاء السيارة قبل البداية.
