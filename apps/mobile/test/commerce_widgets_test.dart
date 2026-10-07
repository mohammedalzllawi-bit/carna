import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:libya_car_auctions/core/api/api_client.dart';
import 'package:libya_car_auctions/core/branding/platform_branding.dart';
import 'package:libya_car_auctions/core/branding/startup_splash.dart';
import 'package:libya_car_auctions/features/account/presentation/wallet_screen.dart';
import 'package:libya_car_auctions/features/account/presentation/workspace_screen.dart';
import 'package:libya_car_auctions/features/account/presentation/profile_tools_screen.dart';

ApiClient mockClient(Map<String, dynamic> responses, List<String> requests) {
  final api = ApiClient();
  api.dio.interceptors.insert(0,
      InterceptorsWrapper(onRequest: (options, handler) {
    requests.add('${options.method} ${options.path}');
    handler.resolve(Response<dynamic>(
        requestOptions: options, data: responses[options.path]));
  }));
  return api;
}

Widget app(Widget child) => ProviderScope(
      overrides: [
        platformBrandingProvider
            .overrideWith((ref) async => const PlatformBranding())
      ],
      child: MaterialApp(
          locale: const Locale('ar'),
          supportedLocales: const [Locale('ar')],
          localizationsDelegates: GlobalMaterialLocalizations.delegates,
          home: child),
    );

void main() {
  for (final width in [320.0, 393.0]) {
    testWidgets(
        'Wallet and subscription cards fit at $width px without creating a payment',
        (tester) async {
      tester.view.physicalSize = Size(width, 852);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final requests = <String>[];
      final api = mockClient({
        '/v1/wallet': {
          'accounts': [
            {'currency': 'LYD', 'balanceLyd': 150.0}
          ],
          'entries': [],
          'withdrawals': []
        },
        '/v1/payments/orders': [],
        '/v1/payments/providers': [],
        '/v1/subscriptions/me': {
          'required': true,
          'subscriptions': [],
          'plans': [
            {
              'id': 'plan',
              'name': 'باقة نشر المزادات',
              'priceLyd': 25,
              'durationDays': 30,
              'auctionLimit': 3
            }
          ]
        },
      }, requests);
      await tester.pumpWidget(app(WalletScreen(client: api)));
      await tester.pumpAndSettle();
      expect(find.text('الرصيد المتاح'), findsOneWidget);
      expect(find.textContaining('يمكنك طلب استرداده'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(
          app(ProfileToolsScreen(mode: 'subscriptions', client: api)));
      await tester.pumpAndSettle();
      expect(find.text('باقة نشر المزادات'), findsOneWidget);
      expect(find.text('اختيار الباقة'), findsOneWidget);
      expect(requests.every((r) => r.startsWith('GET ')), isTrue);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      api.dio.close();
    });
  }
  testWidgets('Technician sees incoming paid inspection and accept action',
      (tester) async {
    final requests = <String>[];
    final api = mockClient({
      '/v1/workspace/requests': {
        'technician': {'name': 'فني معتمد', 'availabilityStatus': 'available'},
        'sales': [],
        'inspections': [
          {
            'id': 'inspection',
            'incoming': true,
            'status': 'Paid',
            'priceLyd': 15,
            'vehicle': {'make': 'Toyota', 'model': 'Corolla', 'year': 2020},
            'technician': {'name': 'فني معتمد'}
          }
        ]
      }
    }, requests);
    await tester
        .pumpWidget(app(WorkspaceScreen(technician: true, client: api)));
    await tester.pumpAndSettle();
    expect(find.text('واجهة الفني'), findsOneWidget);
    expect(find.text('طلبات الفحص'), findsOneWidget);
    expect(find.text('قبول'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    api.dio.close();
  });
  testWidgets('Guest cannot favorite a vehicle without signing in',
      (tester) async {
    var loginRequests = 0;
    await tester.pumpWidget(app(Scaffold(
        body: FavoriteButton(
            vehicleId: 'vehicle',
            isGuest: true,
            onLogin: () => loginRequests++))));
    await tester.tap(find.byType(IconButton));
    await tester.pump();
    expect(loginRequests, 1);
    expect(tester.takeException(), isNull);
  });
  testWidgets('Dealer portal exposes the auction action only through plan permissions', (tester) async {
    final requests = <String>[];
    final api = mockClient({'/v1/dealer/me': {
      'dealer': {'name': 'معرض الاختبار', 'ratingAverage': 4},
      'currentSubscription': {'plan': {'name': 'باقة المعرض', 'permissions': ['CAN_CREATE_AUCTION']}},
      'plans': [], 'reviews': [], 'vehicles': [
        {'id': 'vehicle', 'make': 'Toyota', 'model': 'Corolla', 'year': 2020, 'approvalStatus': 'Draft'}
      ]
    }}, requests);
    await tester.pumpWidget(app(ProfileToolsScreen(mode: 'dealer', client: api)));
    await tester.pumpAndSettle();
    expect(find.text('واجهة المعرض'), findsOneWidget);
    expect(find.text('طلبات شراء المعرض'), findsOneWidget);
    await tester.ensureVisible(find.byType(PopupMenuButton<String>));
    await tester.tap(find.byType(PopupMenuButton<String>));
    await tester.pumpAndSettle();
    expect(find.text('إرسال للمزاد'), findsOneWidget);
    expect(find.text('إرسال للمراجعة'), findsOneWidget);
    expect(requests.every((r) => r.startsWith('GET ')), isTrue);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    api.dio.close();
  });
  testWidgets('Startup animation releases the app after its short duration',
      (tester) async {
    await tester.pumpWidget(
        app(const StartupSplash(child: Scaffold(body: Text('ready')))));
    await tester.pump(const Duration(milliseconds: 900));
    await tester.pump();
    expect(find.text('ready'), findsOneWidget);
    expect(find.text('كارنا'), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets('Startup respects reduced motion', (tester) async {
    await tester.pumpWidget(app(const MediaQuery(
        data: MediaQueryData(disableAnimations: true),
        child: StartupSplash(child: Scaffold(body: Text('ready'))))));
    expect(find.text('كارنا'), findsNothing);
    expect(find.text('ready'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    expect(tester.takeException(), isNull);
  });
}
