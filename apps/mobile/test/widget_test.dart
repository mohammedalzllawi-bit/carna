import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:libya_car_auctions/features/auth/presentation/auth_gate.dart';
import 'package:libya_car_auctions/core/api/api_client.dart';
import 'package:libya_car_auctions/core/branding/platform_branding.dart';
import 'package:libya_car_auctions/features/home/presentation/home_screen.dart';
import 'package:libya_car_auctions/features/vehicles/domain/vehicle.dart';

void main() {
  Future<void> showAuth(WidgetTester tester) async {
    tester.view.physicalSize = const Size(393, 852);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(const ProviderScope(
        child: MaterialApp(
      locale: Locale('ar'),
      supportedLocales: [Locale('ar')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      home: AuthScreen(loading: false),
    )));
    await tester.pumpAndSettle();
  }

  testWidgets('Phone login is RTL and hides the password', (tester) async {
    await showAuth(tester);
    expect(find.text('رقم الهاتف الليبي'), findsOneWidget);
    expect(find.text('متابعة كضيف'), findsOneWidget);
    final password = tester.widget<TextField>(find.byType(TextField).last);
    expect(password.obscureText, isTrue);
    expect(Directionality.of(tester.element(find.byType(AuthScreen))),
        TextDirection.rtl);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Registration adds the name field without a network request',
      (tester) async {
    await showAuth(tester);
    await tester.tap(find.text('حساب جديد'));
    await tester.pumpAndSettle();
    expect(find.text('الاسم الكامل'), findsOneWidget);
    expect(find.text('إنشاء الحساب'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Registration explains invalid account fields before networking',
      (tester) async {
    await showAuth(tester);
    await tester.tap(find.text('حساب جديد'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('إنشاء الحساب'));
    await tester.pump();
    expect(find.text('أدخل الاسم الكامل.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Guest home opens without returning a Future from setState',
      (tester) async {
    final client = ApiClient();
    client.dio.interceptors.insert(0,
        InterceptorsWrapper(onRequest: (options, handler) {
      handler
          .resolve(Response<List<dynamic>>(requestOptions: options, data: []));
    }));
    await tester.pumpWidget(ProviderScope(
      overrides: [
        apiClientProvider.overrideWithValue(client),
        platformBrandingProvider
            .overrideWith((ref) async => const PlatformBranding()),
        homeDataProvider.overrideWith(
          (ref) async => const HomeData(cities: [], vehicles: []),
        ),
      ],
      child: const MaterialApp(home: HomeScreen(isGuest: true)),
    ));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('المركبات المنشورة'), findsOneWidget);
  });

  for (final width in [320.0, 393.0]) {
    testWidgets('Home offers use two cards per row at ${width.toInt()}px',
        (tester) async {
      tester.view.physicalSize = Size(width, 852);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final client = ApiClient();
      final publishedAt = DateTime.now()
          .toUtc()
          .subtract(const Duration(hours: 7))
          .toIso8601String();
      client.dio.interceptors.insert(0,
          InterceptorsWrapper(onRequest: (options, handler) {
        handler.resolve(Response<List<dynamic>>(
          requestOptions: options,
          data: [
            {
              'id': 'first',
              'lotNumber': '101',
              'make': 'Toyota',
              'model': 'Corolla',
              'year': 2020,
              'saleType': 'FixedPrice',
              'category': 'Car',
              'priceLyd': 85000,
              'publishedAt': publishedAt,
              'city': {'nameAr': 'بنغازي'},
            },
            {
              'id': 'second',
              'lotNumber': '102',
              'make': 'Mercedes-Benz',
              'model': 'Sprinter Extra Long',
              'year': 2021,
              'saleType': 'QuickSale',
              'category': 'Truck',
              'priceLyd': 125000,
              'publishedAt': publishedAt,
              'city': {'nameAr': 'بنغازي'},
            },
          ],
        ));
      }));

      await tester.pumpWidget(ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(client),
          platformBrandingProvider
              .overrideWith((ref) async => const PlatformBranding()),
          homeDataProvider.overrideWith(
            (ref) async => const HomeData(cities: [], vehicles: []),
          ),
        ],
        child: const MaterialApp(home: HomeScreen(isGuest: true)),
      ));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Toyota Corolla'));
      await tester.pumpAndSettle();

      final first = tester.getTopLeft(find.ancestor(
          of: find.text('Toyota Corolla'), matching: find.byType(Card)));
      final second = tester.getTopLeft(find.ancestor(
          of: find.text('Mercedes-Benz Sprinter Extra Long'),
          matching: find.byType(Card)));
      expect(first.dy, second.dy);
      expect(first.dx, isNot(second.dx));
      expect(find.text('منذ 7 ساعات'), findsNWidgets(2));
      expect(tester.takeException(), isNull);
    });
  }
}
