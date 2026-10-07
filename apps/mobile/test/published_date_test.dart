import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart' show initializeDateFormatting;
import 'package:libya_car_auctions/core/format/published_date.dart';

void main() {
  setUpAll(() async => initializeDateFormatting('ar'));
  final now = DateTime(2026, 1, 20, 12);

  test('recent publications use minutes, hours and days', () {
    expect(publishedDateRelative(now, now: now), 'الآن');
    expect(
        publishedDateRelative(now.subtract(const Duration(minutes: 1)),
            now: now),
        'منذ دقيقة');
    expect(
        publishedDateRelative(now.subtract(const Duration(hours: 7)), now: now),
        'منذ 7 ساعات');
    expect(
        publishedDateRelative(now.subtract(const Duration(days: 1)), now: now),
        'منذ يوم');
    expect(
        publishedDateRelative(now.subtract(const Duration(days: 2)), now: now),
        'منذ يومين');
    expect(
        publishedDateRelative(now.subtract(const Duration(days: 9)), now: now),
        'منذ 9 أيام');
  });

  test('ten days and older show day, month and old year when needed', () {
    expect(publishedDateRelative(DateTime(2026, 1, 10, 12), now: now),
        'منذ 10 يناير');
    expect(publishedDateRelative(DateTime(2025, 12, 30, 12), now: now),
        'منذ 30 ديسمبر 2025');
  });

  test('detail date includes the hour and minutes', () {
    final detailed = publishedDateDetailed(DateTime(2026, 1, 6, 14, 35));
    expect(detailed, contains('6 يناير 2026'));
    expect(detailed, contains('2:35'));
  });
}
