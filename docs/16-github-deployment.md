# تجهيز GitHub والاستضافة

المستودع المحدد للمشروع هو [carna](https://github.com/mohammedalzllawi-bit/carna). رفع الكود إلى GitHub لا يشغل المنصة تلقائياً، ولم تحدد بيانات الاستضافة بعد. يحتاج API وواجهتا Next إلى استضافة عمليات Node؛ GitHub Pages لا يشغل هذا الخادم.

## الملفات الآمنة

`.gitignore` يستبعد `.env` ونسخه، مفاتيح الخدمة والتوقيع، ملفات Firebase المحلية، بيانات Mongo المحلية، الصور المؤقتة وحزم APK. فقط أمثلة البيئة ذات القيم الوهمية تدخل المستودع. استبعاد ملف الآن لا يزيله من تاريخ سابق؛ إذا سبق نشر مفتاح يجب تدويره ومعالجة التاريخ.

قبل أول رفع:

```powershell
git status --short
git check-ignore -- .env '.env copy.example' apps/mobile/android/app/google-services.json
git add .gitignore .github README.md docs apps packages scripts test package.json package-lock.json turbo.json .env.example
git diff --cached --stat
git diff --cached --name-only
git commit -m "Prepare Carna platform and deployment checks"
git remote add origin https://github.com/mohammedalzllawi-bit/carna.git
git push -u origin main
```

راجع الملفات قبل `commit`، لا تضف `-f` لملفات الأسرار. إضافة `origin` مطلوبة مرة واحدة فقط؛ استخدم `git remote -v` للتحقق من وجهته قبل أي رفع.

## التحقق الآلي

`.github/workflows/ci.yml` يشغل فحص الاعتماديات بمستوى High، صلاحية Prisma، اختبارات الخادم وأوامر التشغيل، بناء الويب والإدارة، تحليل Flutter واختبارات الواجهات. لا يستخدم مفاتيح إنتاج ولا يرسل رسائل أو مدفوعات حقيقية. اختبارات Mongo التكاملية ليست ضمن هذا Workflow حتى توفير قاعدة اختبار Replica Set معزولة.

توثيق الأدوات: [checkout](https://github.com/actions/checkout)، [setup-node](https://github.com/actions/setup-node)، [Flutter action](https://github.com/subosito/flutter-action). Dependabot يراجع تحديثات الاعتماديات وActions أسبوعياً؛ لا يوجد دمج آلي.

## Railway وRailpack

خطأ `No start command detected` كان سببه غياب `start` من `package.json` في الجذر. أصبح `npm start` يشغل API، و`railpack.json` يبني API فقط عبر `npm run api:build`، الذي يولد Prisma قبل تجميع NestJS. الأمر لا يغير قاعدة البيانات ولا ينشئ بيانات تجريبية. يبقى `npm run build` العام متاحاً لبناء جميع تطبيقات Node محلياً.

أنشئ **ثلاث خدمات** من المستودع نفسه، كلها من جذر المستودع: اترك **Root Directory** فارغاً أو `/`، ولا تجعله `apps/api` أو `apps/web` لأن هذه التطبيقات تعتمد على npm workspaces وملف القفل في الجذر.

| الخدمة | متغير `RAILPACK_CONFIG_FILE` في Variables | Build Command | Start Command |
| --- | --- | --- | --- |
| API | `railpack.json` أو اتركه غير محدد | `npm run api:build` | `npm start` |
| Web | `deploy/railpack.web.json` | `npm run build --workspace @libya-auctions/web` | `npm run web:start` |
| Admin | `deploy/railpack.admin.json` | `npm run build --workspace @libya-auctions/admin` | `npm run admin:start` |

اختر Railpack للبناء. الملفات أعلاه تحدد Node 24 وأوامر كل خدمة، وتثبت أدوات البناء دون تنزيل MongoDB المحلي للاختبارات عبر `MONGOMS_DISABLE_POSTINSTALL=1`. أزل أي Custom Install/Build/Start Command أو متغير `RAILPACK_INSTALL_CMD` / `RAILPACK_BUILD_CMD` / `RAILPACK_START_CMD` قديم لا يطابق هذه الإعدادات. لا يشغل `npm start` الويب أو الإدارة مع API داخل حاوية واحدة. لا ينشر Railway تطبيق Flutter؛ يبنى ويوزع منفصلاً.

خطوة `install` تضبط متغير تعطيل تنزيل MongoDB، ولا تستبدل `commands` أو `inputs` الافتراضية. يتضمن أمر التثبيت الافتراضي إعداد Corepack ونسخ ملفات `package.json` وملف القفل وبيانات workspaces إلى الصورة قبل تثبيت الاعتماديات؛ استبداله بقائمة تحتوي `npm ci` وحده يزيل أوامر النسخ ويفشل بناء الصورة. يجب التحقق من هذه الأوامر داخل خطة Railpack المولدة، وليس من نجاح `prepare` فقط.

في خدمة API، تضبط خطوة `install` الحقل `deployOutputs: []` لمنع Railpack من إضافة نسخة التثبيت القديمة مباشرة إلى صورة التشغيل. يأتي `node_modules` من خطوة `build` الافتراضية؛ إضافة طبقة `install` بعدها تعيد ملفات Prisma المؤقتة فوق العميل المولّد، ويظهر خطأ `IsEnum` / `Cannot convert undefined or null to object` عند تحميل DTOs. تظل خطوة التثبيت مطلوبة كمدخل للبناء. يشغّل `api:build` فحص `verify-runtime.cjs` بعد توليد Prisma وتجميع Nest، ويعيد `prestart` الفحص داخل صورة التشغيل. لا يتصل هذا الفحص بقاعدة البيانات ولا يعيد توليد العميل عند التشغيل.

في Variables لخدمة API، أدخل القيم الحقيقية من `apps/api/.env.production.example`، ومنها `NODE_ENV=production` و`AUCTION_WORKER_MODE=redis` وMongoDB Replica Set وRedis ومفاتيح JWT والتخزين. ملف `.env` الموجود على جهازك **لا ينتقل إلى Railway**. لا تضع `DATABASE_URL` أو مفاتيح الدفع وCloudinary وResala في خدمة Web/Admin؛ تحتاج واجهتا الويب والإدارة إلى قيم API الخاصة بهما فقط. لا تضع مسار Windows المحلي لملف Firebase في الاستضافة؛ وفّر ملف اعتماد يمكن للخادم الوصول إليه وأضف مساره الصحيح.

ولّد نطاق HTTPS لكل خدمة. اضبط `API_URL` في Web/Admin إلى نطاق API، و`NEXT_PUBLIC_API_URL` في Web إلى النطاق نفسه قبل البناء. اضبط `CORS_ORIGINS` في API إلى نطاقي Web/Admin الفعليين، مفصولين بفاصلة. تستخدم الخدمات `PORT` الذي تضبطه الاستضافة؛ عند تحديد منفذ يدوياً استخدم `8080` مثلاً وليس المنفذ المحلي المحجوز `3000`.

بعد حفظ Variables وإعدادات الخدمات، افتح Command Palette عبر `Ctrl+K` على Windows أو `Cmd+K` على macOS، واختر **Deploy Latest Commit** من الفرع المتصل `main`. تحقق من SHA في تفاصيل النشر: زر Redeploy في نشر قديم يعيد بناء نفس النسخة القديمة ولا يختار آخر تعديل تلقائياً. هذه الملفات تعالج اكتشاف البناء والتشغيل؛ نجاح النشر الفعلي ما زال يتطلب متغيرات إنتاج صحيحة وخدمات البيانات والتخزين. لا تنفذ `seed:demo` أو أوامر حذف البيانات أثناء النشر.

المراجع الرسمية: [إعداد ملفات Railpack](https://railpack.com/config/file)، [نشر monorepo على Railway](https://docs.railway.com/deployments/monorepo).

## Backend

استخدم Node 24. مجلد عمل الخدمة هو جذر المستودع، مع متغيرات الاستضافة الحقيقية التي يقترح أسماءها `apps/api/.env.production.example`.

البناء:

```sh
npm ci
npm run api:build
```

التشغيل:

```sh
npm run api:start
```

يلتقط API متغير `PORT`، والمنفذ المحلي الافتراضي4100. أمر الإنتاج لا يشترط وجود ملف `.env` عندما تحقن الاستضافة المتغيرات مباشرة.

المسار `GET /` يعيد JSON باسم `Carna API` وروابط التوثيق والفحص بدلاً من 404؛ ليس واجهة الموقع أو الإدارة. المسار `GET /health` يعيد HTTP 200 و`check: liveness` دون تسجيل دخول أو اعتماد على إعدادات الصيانة. يمكن استخدامه كـHealthcheck Path في Railway. هذا فحص لحياة عملية API فقط، وليس تأكيداً لسلامة MongoDB أو Redis أو الدفع؛ لا يعرض إعدادات البيئة أو بيانات المستخدمين، ولا يغير مسارات `/v1` أو حماية CSP.

يلزم MongoDB Replica Set يدعم المعاملات، Redis، `AUCTION_WORKER_MODE=redis`، HTTPS/WSS، مفاتيح JWT مستقلة قوية وCORS للنطاقات الفعلية. ضع مفتاح خدمة Firebase في Secret File ومرر مساره في `GOOGLE_APPLICATION_CREDENTIALS`. مفاتيح Resala وCloudinary والدفع للخادم فقط. بنية التحقق الحالية تطلب إعدادات S3 أيضاً للمستندات الحساسة.

لقاعدة موجودة: نسخة احتياطية واختبار استرجاع، إيقاف الكتابة، مراجعة المخطط، ثم `npm run db:upgrade`. الأمر يضيف الحقول والفهارس ولا يحذف السجلات. لا تشغل `seed:demo` في الإنتاج ولا توافق على `db push --accept-data-loss`. لقاعدة جديدة راجع `db:push` ثم التهيئة الأساسية و`admin:bootstrap` قبل فتحها للمستخدمين.

## Web وAdmin

أنشئ خدمتي Node منفصلتين من نفس المستودع. حدد `API_URL=https://api.YOUR_DOMAIN` في كل خدمة. الويب يحتاج `NEXT_PUBLIC_API_URL` نفسه للمزايدة الحية، والإدارة تستخدم أمثلة بيئتها. المتغيرات العامة تُحسم أثناء البناء، فلا تضع أسراراً في `NEXT_PUBLIC_*`.

```sh
npm ci
npm run build --workspace @libya-auctions/web
npm run web:start
```

```sh
npm ci
npm run build --workspace @libya-auctions/admin
npm run admin:start
```

كل خدمة تقبل `PORT` المحقون من الاستضافة. الافتراضي محلياً3100 و3101؛3000 محجوز ولا يستخدم. أمن النطاقات وOrigin وCookies مطلوب، ولا تستخدم مجلد API كجذر لخدمة Next. لا تنشر الإدارة بمفتاح Admin ثابت داخل المتصفح.

## Flutter

أعد ملفات Firebase من إعدادات المشروع الخاصة إلى Android وiOS خارج Git، وتأكد من تطابق معرف الحزمة. أبق مفاتيح توقيع Android وشهادات iOS في تخزين أسرار البناء. استخدم API إنتاج HTTPS متاحاً خارج الكمبيوتر:

```sh
cd apps/mobile
flutter pub get
flutter analyze --no-fatal-infos
flutter test
flutter build appbundle --release --dart-define=API_BASE_URL=https://api.YOUR_DOMAIN
```

تحقق من إعداد توقيع Release الحقيقي قبل البناء للنشر؛ APK تجريبي أو توقيع Debug ليس إصدار متجر. نسخة Android المحلية في `apps/mobile/build/app/outputs/flutter-apk/app-debug.apk` مخصصة للتجربة عبر API محلي وليست للاستضافة أو المتجر. هيكل iOS غير موجود حالياً؛ يلزم توليده، ضبط Bundle ID وFirebase والتوقيع، ثم بناؤه واختباره على macOS قبل إطلاق iOS.

## بوابة الإطلاق

- مزود دفع واحد على الأقل بوثائقه الرسمية، مفاتيح التاجر، Webhook موثّق واختبار مبلغ صغير واسترداد حقيقي.
- شروط وأحكام منشورة مع رسوم الاشتراكات والنشر والعربون وسياسة تأمين المزايدة والاسترداد.
- اختبار Push على جهاز فعلي، وإعداد مراقبة فشل الإشعارات وOTP والدفع.
- مراجعة أمنية مستقلة واختبار تحميل للمزايدات والعامل، نسخ احتياطية مشفرة واختبار استعادة وتنبيهات أعطال.
- إزالة بيانات التجربة قبل فتح الخدمة وعدم الاعتماد على الحسابات التجريبية.

الفحص المحلي للاعتماديات أزال تنبيهات High، لكنه أبقى تنبيهين Moderate مرتبطين بـ`uuid` ضمن اعتمادية Firebase Storage. يجب مراجعة تحديث متوافق قبل اعتماد الإطلاق؛ لا تستخدم `npm audit fix --force` دون اختبار. نجاح CI أو البناء ليس شهادة أمنية أو تصريحاً باستقبال الأموال.
