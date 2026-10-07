import 'package:intl/intl.dart';

String publishedDateRelative(DateTime publishedAt, {DateTime? now}) {
  final date = publishedAt.toLocal();
  final age = (now ?? DateTime.now()).toLocal().difference(date);
  if (age.isNegative || age.inSeconds < 60) return 'الآن';

  if (age.inMinutes < 60) {
    final minutes = age.inMinutes;
    if (minutes == 1) return 'منذ دقيقة';
    if (minutes == 2) return 'منذ دقيقتين';
    return 'منذ $minutes ${minutes <= 10 ? 'دقائق' : 'دقيقة'}';
  }
  if (age.inHours < 24) {
    final hours = age.inHours;
    if (hours == 1) return 'منذ ساعة';
    if (hours == 2) return 'منذ ساعتين';
    return 'منذ $hours ${hours <= 10 ? 'ساعات' : 'ساعة'}';
  }
  if (age.inDays < 10) {
    final days = age.inDays;
    if (days == 1) return 'منذ يوم';
    if (days == 2) return 'منذ يومين';
    return 'منذ $days أيام';
  }

  final sameYear = date.year == (now ?? DateTime.now()).toLocal().year;
  final pattern = sameYear ? 'd MMMM' : 'd MMMM yyyy';
  return 'منذ ${DateFormat(pattern, 'ar').format(date)}';
}

String publishedDateDetailed(DateTime publishedAt) =>
    DateFormat('d MMMM yyyy، h:mm a', 'ar').format(publishedAt.toLocal());
