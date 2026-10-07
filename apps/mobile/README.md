# Flutter Mobile App

مصدر تطبيق Flutter مرتبط بواجهة NestJS: التسجيل والدخول والضيف، الكتالوج والفنيون، قائمة المزادات والمزايدة، وقراءة الحساب والإشعارات. تفاصيل المزاد تستقبل أحداث Socket.IO مع تحديث دوري احتياطي، وتُحدَّث قائمة المزادات والمحفظة تلقائياً. ملفات Android موجودة؛ ملفات iOS لم تُنشأ بعد. اسم التطبيق على Android هو «Carna» ومعرّفه `ly.benghazi.auctions.libya_car_auctions`.

## التشغيل

يتطلب Flutter SDK وAndroid SDK وJava المتوافق مع Gradle. تم التحقق من الكود واختبارات الواجهة باستخدام Flutter 3.44.4 وDart 3.12.2. من داخل `apps/mobile`:

```powershell
flutter pub get
flutter analyze
flutter test
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:4100
```

العنوان `10.0.2.2` مخصص لمحاكي Android. للهاتف الحقيقي المتصل عبر USB، فعّل USB debugging ووافق على اتصال الكمبيوتر، ثم استبدل `DEVICE_SERIAL` بمعرّف الجهاز من `adb devices`:

```powershell
adb devices
adb -s DEVICE_SERIAL reverse tcp:4100 tcp:4100
flutter run -d DEVICE_SERIAL --dart-define=API_BASE_URL=http://127.0.0.1:4100
```

يجب أن يبقى خادم API على الكمبيوتر يعمل على المنفذ 4100 وأن يبقى USB متصلاً. أعد أمر `adb reverse` بعد فصل الجهاز أو إعادة تشغيله. لا يحتوي التطبيق على مفاتيح الخادم أو كلمة سر الإدارة.

لإنشاء APK محلي لهاتف ARM64:

```powershell
flutter build apk --debug --target-platform android-arm64 --dart-define=API_BASE_URL=http://127.0.0.1:4100
adb -s DEVICE_SERIAL install -r build/app/outputs/flutter-apk/app-debug.apk
```

نسخة debug تسمح باتصال HTTP بعناوين التطوير المحلية فقط (`localhost` و`127.0.0.1` و`10.0.2.2`). للإنتاج استخدم HTTPS لخادم منشور، وتهيئة توقيع release بمفتاح خاص خارج Git؛ لم تتم تهيئة توقيع النشر بعد.

### Windows ومسار المشروع العربي

إذا تعطل تحليل Dart أو بناء Android بسبب مسار Unicode/OneDrive، ابنِ من نسخة عمل بمسار لاتيني، دون نقل أو حذف المشروع الأصلي. مثال من داخل `apps/mobile`:

```powershell
$buildRoot = Join-Path $env:LOCALAPPDATA ("LibyaAuctions/android-debug-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $buildRoot -Force | Out-Null
Copy-Item -LiteralPath lib,android,test,pubspec.yaml,pubspec.lock,analysis_options.yaml -Destination $buildRoot -Recurse
Set-Location -LiteralPath $buildRoot
flutter pub get
flutter analyze
flutter test
flutter build apk --debug --target-platform android-arm64 --dart-define=API_BASE_URL=http://127.0.0.1:4100
```

إذا لم يكن Flutter في `PATH`، يمكن تشغيله باستخدام `& "$env:USERPROFILE\flutter\bin\flutter.bat"` بدلاً من `flutter`. مسار ADB المعتاد هو `$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe`.

## البنية الموجودة

```text
lib/
  core/
    api/
  features/
    auth/
    home/
    vehicles/
    auctions/
    technicians/
    account/
```

Architecture:

- Riverpod.
- Dio for API.
- Secure Storage for tokens.
- RTL. الترجمة الكاملة وPush Notifications وDeep Links وتدفقات الفحص والنزاع والدفع داخل الهاتف ما زالت غير مكتملة.

يتطلب بناء iOS جهاز macOS وXcode وتوقيعاً معتمداً. راجع `docs/12-project-audit.md` لحالة المنصة، ولا تعتبر `flutter create` أو قيم البيئة وحدهما كافيين لإطلاق التطبيق.
