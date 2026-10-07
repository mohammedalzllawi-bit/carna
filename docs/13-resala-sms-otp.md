# Resala SMS/OTP

التكامل داخل NestJS فقط. لا تضع `RESALA_API_TOKEN` أو `RESALA_OTP_SECRET` في Next.js أو Flutter، ولا تسجل `pin` في Logs.

## الإعداد

في ملف البيئة الخاص بالخادم:

```dotenv
RESALA_BASE_URL=https://dev.resala.ly/api/v1
RESALA_API_TOKEN=<token-from-resala>
RESALA_OTP_SECRET=<random-secret-at-least-32-characters>
RESALA_SERVICE_NAME=Carna
# RESALA_AUTOFILL_HASH=<android-app-signature-hash>
```

في `development` و`test` يُضاف `?test` إلى طلبات OTP والقوالب فلا يُرسل SMS فعلي. في `production` لا يُضاف هذا المعامل، لذا تحقق من عنوان الخدمة ومفتاح الحساب والرصيد قبل النشر. عميل المشروع لا ينفذ `bulk-send`.

بعد نسخ قاعدة البيانات احتياطياً، شغّل `npm.cmd run prisma:push --workspace @libya-auctions/api` لإنشاء `PhoneOtpChallenge` وفهرس الهاتف الفريد. فهرس TTL الخاص بـ`RateLimitWindow` مُدار خارج Prisma؛ شغّل `npm.cmd run db:upgrade` بعد أي `db push` لاستعادته، وفق إرشادات التحديث في README.

## توثيق الهاتف

يسجل المستخدم أو يدخل أولاً، ثم يرسل Access Token إلى:

```text
POST /v1/auth/phone/request-otp   body: {}
POST /v1/auth/phone/verify-otp    body: {"code":"123456"}
```

كلا المسارين يتطلبان `Authorization: Bearer <access-token>`. رقم الهاتف يؤخذ من جلسة المستخدم، وليس من جسم الطلب. استجابة طلب الرمز تحتوي `sent` و`expiresAt` و`resendAfterSeconds` فقط؛ لا تُعيد PIN إلى العميل. يُخزن HMAC للرمز لمدة خمس دقائق، ويمكن طلب رمز جديد بعد 60 ثانية، وتُرفض المحاولة السادسة. نجاح التحقق يفعّل الهاتف والحساب المعلّق داخل معاملة واحدة.

إذا انقطع اتصال `POST /pins`، تبقى مهلة إعادة الإرسال حفاظاً على عدم تكرار SMS محتمل. لا تعِد أي POST تلقائياً. استعلام سجل التسليم GET وحده يعاد مرتين على الأكثر عند فشل الشبكة.

## استخدام العميل داخل الخادم

```ts
import { ResalaClient } from './modules/resala/resala.client'; // inside apps/api/src

const resala = new ResalaClient({
  baseUrl: process.env.RESALA_BASE_URL ?? 'https://dev.resala.ly/api/v1',
  token: process.env.RESALA_API_TOKEN,
  production: process.env.NODE_ENV === 'production',
  serviceName: 'Carna',
});

await resala.sendTemplate('123e4567-e89b-12d3-a456-426614174000', [
  { phone: '218910001234', '$1': 'Toyota Camry' },
]);
const log = await resala.sentView({ source: 'message', page: 1, paginate: 10 });
// log.data rows may be accepted, sent, delivered or undelivered.
```

معرف القالب يؤخذ من لوحة Resala بعد اعتماد القالب. استخدم العميل المحقون `RESALA_CLIENT` داخل خدمات NestJS؛ المثال أعلاه يوضح الأنواع فقط. لا تُرسل رسائل حقيقية من الاختبارات: طبقة HTTP فيها وهمية بالكامل.
