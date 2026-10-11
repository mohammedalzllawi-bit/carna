import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:libya_car_auctions/core/api/api_configuration.dart';
import 'package:libya_car_auctions/main.dart';

void main() {
  test('a missing API does not silently select the emulator', () {
    expect(apiConfigurationError('', release: false), contains('missing'));
    expect(apiConfigurationError('', release: true), contains('missing'));
  });

  test('a public HTTPS origin works in debug and release', () {
    for (final release in [false, true]) {
      for (final url in [
        'https://api.example.com',
        'https://api.example.com/'
      ]) {
        expect(apiConfigurationError(url, release: release), isNull);
      }
    }
  });

  test('local HTTP must be explicitly selected and is debug-only', () {
    for (final host in ['localhost', '127.0.0.1', '10.0.2.2']) {
      expect(
          apiConfigurationError('http://$host:4100', release: false), isNull);
      expect(
          apiConfigurationError('http://$host:4100', release: true), isNotNull);
    }
  });

  test('release cannot depend on laptop or internal HTTPS addresses', () {
    for (final host in [
      'localhost',
      'localhost.',
      'carna.local',
      'api.railway.internal',
      '127.0.0.1',
      '10.0.2.2',
      '192.168.50.129',
      '172.16.0.1',
      '172.31.255.254',
      '169.254.1.1',
      '0.0.0.0',
      '[::1]',
      '[::]',
      '[fd00::1]',
      '[::ffff:192.168.1.1]',
    ]) {
      expect(apiConfigurationError('https://$host', release: true), isNotNull,
          reason: host);
    }
  });

  test('invalid origins, credentials and insecure public APIs are rejected',
      () {
    for (final url in [
      'api.example.com',
      '/v1',
      'ftp://api.example.com',
      'https://user:password@api.example.com',
      'https://api.example.com/v1',
      'https://api.example.com?token=secret',
      'https://api.example.com#fragment',
      'http://api.example.com',
      'http://192.168.50.129:4100',
    ]) {
      expect(apiConfigurationError(url, release: false), isNotNull,
          reason: url);
    }
  });

  for (final width in [320.0, 393.0]) {
    testWidgets('missing configuration has an RTL error at $width px',
        (tester) async {
      tester.view.physicalSize = Size(width, 852);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(const ApiConfigurationErrorApp());
      expect(find.text('تعذر تشغيل هذه النسخة'), findsOneWidget);
      expect(
          Directionality.of(tester.element(find.text('تعذر تشغيل هذه النسخة'))),
          TextDirection.rtl);
      expect(find.text('تسجيل الدخول'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }
}
