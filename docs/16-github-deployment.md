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

## Backend

استخدم Node 24. مجلد عمل الخدمة هو جذر المستودع، مع متغيرات الاستضافة الحقيقية التي يقترح أسماءها `apps/api/.env.production.example`.

البناء:

```sh
npm ci
npm run prisma:generate --workspace @libya-auctions/api
npm run build --workspace @libya-auctions/api
```

التشغيل:

```sh
npm run api:start
```

يلتقط API متغير `PORT`، والمنفذ المحلي الافتراضي4100. أمر الإنتاج لا يشترط وجود ملف `.env` عندما تحقن الاستضافة المتغيرات مباشرة.

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
