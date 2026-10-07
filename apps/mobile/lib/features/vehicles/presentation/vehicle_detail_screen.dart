import 'package:flutter/material.dart';
import 'package:intl/intl.dart' show NumberFormat;
import 'package:url_launcher/url_launcher.dart';

import '../../../core/api/api_client.dart';
import '../../../core/format/published_date.dart';
import '../data/vehicle_repository.dart';
import '../domain/vehicle.dart';
import 'listing_chat_screen.dart';
import '../../account/presentation/profile_tools_screen.dart';
import '../../account/presentation/workspace_screen.dart';

class VehicleDetailScreen extends StatefulWidget {
  const VehicleDetailScreen(
      {super.key,
      required this.vehicleId,
      required this.isGuest,
      this.onLogin});
  final String vehicleId;
  final bool isGuest;
  final VoidCallback? onLogin;

  @override
  State<VehicleDetailScreen> createState() => _VehicleDetailScreenState();
}

class _VehicleDetailScreenState extends State<VehicleDetailScreen> {
  final _repository = VehicleRepository(ApiClient());
  late Future<Vehicle> _vehicle = _repository.detail(widget.vehicleId);
  void _reload() {
    final next = _repository.detail(widget.vehicleId);
    setState(() {
      _vehicle = next;
    });
  }

  bool _openingChat = false;

  Future<void> _message() async {
    if (widget.isGuest) {
      final login = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
                title: const Text('سجّل الدخول أولاً'),
                content: const Text('المحادثات متاحة للحسابات المسجلة فقط.'),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: const Text('إلغاء')),
                  FilledButton(
                      onPressed: () => Navigator.pop(context, true),
                      child: const Text('تسجيل الدخول'))
                ],
              ));
      if (login == true) widget.onLogin?.call();
      return;
    }
    setState(() => _openingChat = true);
    try {
      final chatId = await _repository.startChat(widget.vehicleId);
      if (mounted) {
        Navigator.push(
            context,
            MaterialPageRoute(
                builder: (_) => ListingChatScreen(chatId: chatId)));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('المحادثة غير متاحة لهذا العرض حالياً.')));
      }
    } finally {
      if (mounted) setState(() => _openingChat = false);
    }
  }

  Future<void> _call(String phone) async {
    final uri = Uri(scheme: 'tel', path: phone);
    if (!await launchUrl(uri) && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('تعذر فتح تطبيق الهاتف.')));
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('تفاصيل العرض'), actions: [
          FavoriteButton(
              vehicleId: widget.vehicleId,
              isGuest: widget.isGuest,
              onLogin: widget.onLogin)
        ]),
        body: FutureBuilder<Vehicle>(
            future: _vehicle,
            builder: (context, snapshot) {
              if (!snapshot.hasData) {
                return Center(
                    child: snapshot.hasError
                        ? TextButton.icon(
                            onPressed: _reload,
                            icon: const Icon(Icons.refresh),
                            label: const Text('إعادة المحاولة'))
                        : const CircularProgressIndicator());
              }
              final vehicle = snapshot.data!;
              final gallery = vehicle.images.isNotEmpty
                  ? vehicle.images
                  : [if (vehicle.imageUrl != null) vehicle.imageUrl!];
              return Column(children: [
                Expanded(
                    child: ListView(children: [
                  SizedBox(
                      height: 255,
                      child: gallery.isEmpty
                          ? const ColoredBox(
                              color: Color(0xFFEAF2FD),
                              child: Center(
                                  child: Icon(Icons.directions_car,
                                      size: 70, color: Color(0xFF1769D2))))
                          : PageView.builder(
                              itemCount: gallery.length,
                              itemBuilder: (context, index) => Image.network(
                                  resolveApiUrl(gallery[index]),
                                  fit: BoxFit.contain,
                                  errorBuilder: (_, __, ___) => const Center(
                                      child: Icon(Icons.broken_image_outlined,
                                          size: 60))))),
                  Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(vehicle.title,
                                style: const TextStyle(
                                    fontSize: 24, fontWeight: FontWeight.w800)),
                            const SizedBox(height: 8),
                            Text(
                                vehicleCategoryLabels[vehicle.category] ??
                                    vehicle.category,
                                style:
                                    const TextStyle(color: Color(0xFF1769D2))),
                            const SizedBox(height: 14),
                            Text(
                                vehicle.priceLyd == null
                                    ? 'السعر عند التواصل'
                                    : '${NumberFormat('#,##0.###', 'ar_LY').format(vehicle.priceLyd)} د.ل',
                                style: const TextStyle(
                                    fontSize: 25,
                                    fontWeight: FontWeight.w800,
                                    color: Color(0xFF1356A8))),
                            const Divider(height: 30),
                            _fact(Icons.calendar_month_outlined, 'سنة الصنع',
                                '${vehicle.year}'),
                            _fact(Icons.location_on_outlined, 'المدينة',
                                vehicle.city ?? 'غير محددة'),
                            _fact(
                                Icons.speed_outlined,
                                'العداد',
                                vehicle.mileageKm == null
                                    ? 'غير محدد'
                                    : '${vehicle.mileageKm} كم'),
                            _fact(Icons.sell_outlined, 'نوع البيع',
                                _saleLabel(vehicle.saleType)),
                            _fact(Icons.tag_outlined, 'رقم العرض',
                                vehicle.lotNumber),
                            if (vehicle.publishedAt != null)
                              _fact(Icons.schedule, 'تاريخ النشر',
                                  publishedDateDetailed(vehicle.publishedAt!)),
                            const SizedBox(height: 12),
                            Wrap(spacing: 8, runSpacing: 8, children: [
                              if (vehicle.saleType != 'Auction')
                                OutlinedButton.icon(
                                    onPressed: () {
                                      if (widget.isGuest) {
                                        widget.onLogin?.call();
                                        return;
                                      }
                                      requestVehicleService(context,
                                          vehicleId: widget.vehicleId,
                                          inspection: false);
                                    },
                                    icon:
                                        const Icon(Icons.shopping_bag_outlined),
                                    label: const Text('طلب شراء')),
                              OutlinedButton.icon(
                                  onPressed: () {
                                    if (widget.isGuest) {
                                      widget.onLogin?.call();
                                      return;
                                    }
                                    requestVehicleService(context,
                                        vehicleId: widget.vehicleId,
                                        inspection: true);
                                  },
                                  icon: const Icon(Icons.fact_check_outlined),
                                  label: const Text('طلب فحص')),
                            ]),
                          ])),
                ])),
                if (vehicle.saleType != 'Auction')
                  SafeArea(
                      top: false,
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                        child: Row(children: [
                          Expanded(
                              child: OutlinedButton.icon(
                                  onPressed: vehicle.contactPhone == null
                                      ? null
                                      : () => _call(vehicle.contactPhone!),
                                  icon: const Icon(Icons.call_outlined),
                                  label: const Text('اتصال'))),
                          const SizedBox(width: 10),
                          Expanded(
                              child: FilledButton.icon(
                                  onPressed: _openingChat ? null : _message,
                                  icon: const Icon(Icons.chat_bubble_outline),
                                  label: const Text('مراسلة'))),
                        ]),
                      )),
              ]);
            }),
      );

  Widget _fact(IconData icon, String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 7),
        child: Row(children: [
          Icon(icon, size: 19, color: const Color(0xFF65758B)),
          const SizedBox(width: 8),
          Text(label, style: const TextStyle(color: Color(0xFF65758B))),
          const Spacer(),
          Flexible(
              child: Text(value,
                  textAlign: TextAlign.end,
                  style: const TextStyle(fontWeight: FontWeight.w600))),
        ]),
      );

  String _saleLabel(String value) => switch (value) {
        'QuickSale' => 'بيع سريع',
        'Negotiable' => 'قابل للتفاوض',
        'Auction' => 'مزاد',
        _ => 'سعر ثابت',
      };
}
