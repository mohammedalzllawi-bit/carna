import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart' show initializeDateFormatting;
import 'features/auth/presentation/auth_gate.dart';
import 'core/branding/platform_branding.dart';
import 'core/notifications/push_notifications.dart';
import 'core/branding/startup_splash.dart';
import 'core/api/api_configuration.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final configurationError =
      apiConfigurationError(apiBaseUrl, release: kReleaseMode);
  if (configurationError != null) {
    debugPrint('API configuration error: $configurationError');
    runApp(const ApiConfigurationErrorApp());
    return;
  }
  await initializeDateFormatting('ar');
  await PushNotifications.instance.initialize();
  runApp(const ProviderScope(child: LibyaCarAuctionsApp()));
}

class ApiConfigurationErrorApp extends StatelessWidget {
  const ApiConfigurationErrorApp({super.key});

  @override
  Widget build(BuildContext context) => const MaterialApp(
        title: 'كارنا',
        debugShowCheckedModeBanner: false,
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: Scaffold(
            body: SafeArea(
              child: Center(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.cloud_off_outlined,
                          size: 40, color: Color(0xFF1769D2)),
                      SizedBox(height: 16),
                      Text('تعذر تشغيل هذه النسخة',
                          style: TextStyle(fontSize: 20)),
                      SizedBox(height: 8),
                      Text(
                          'إعداد الاتصال غير مكتمل. يرجى تثبيت النسخة المحدثة أو التواصل مع الدعم.',
                          textAlign: TextAlign.center),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      );
}

class LibyaCarAuctionsApp extends ConsumerStatefulWidget {
  const LibyaCarAuctionsApp({super.key});

  @override
  ConsumerState<LibyaCarAuctionsApp> createState() =>
      _LibyaCarAuctionsAppState();
}

class _LibyaCarAuctionsAppState extends ConsumerState<LibyaCarAuctionsApp>
    with WidgetsBindingObserver {
  Timer? _brandingRefresh;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _brandingRefresh = Timer.periodic(
      const Duration(minutes: 1),
      (_) => ref.invalidate(platformBrandingProvider),
    );
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      ref.invalidate(platformBrandingProvider);
    }
  }

  @override
  void dispose() {
    _brandingRefresh?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const seed = Color(0xFF1769D2);
    return MaterialApp(
      navigatorKey: PushNotifications.instance.navigatorKey,
      scaffoldMessengerKey: PushNotifications.instance.messengerKey,
      debugShowCheckedModeBanner: false,
      title: 'كارنا',
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar'), Locale('en')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: seed),
        scaffoldBackgroundColor: const Color(0xFFF4F7FB),
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFF0B2347),
          foregroundColor: Colors.white,
          centerTitle: false,
        ),
        cardTheme: const CardThemeData(
          elevation: 0,
          margin: EdgeInsets.zero,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.all(Radius.circular(6)),
            side: BorderSide(color: Color(0xFFD9E2EE)),
          ),
        ),
      ),
      home: const Directionality(
        textDirection: TextDirection.rtl,
        child: StartupSplash(child: AuthGate()),
      ),
    );
  }
}
