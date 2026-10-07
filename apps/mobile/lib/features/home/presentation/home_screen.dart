import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart' show NumberFormat;
import '../../../core/api/api_client.dart';
import '../../../core/branding/platform_branding.dart';
import '../../../core/format/published_date.dart';
import '../../vehicles/domain/vehicle.dart';
import '../data/home_repository.dart';
import '../../technicians/presentation/technicians_screen.dart';
import '../../dealers/presentation/dealers_screen.dart';
import '../../auctions/presentation/auctions_screen.dart';
import '../../account/presentation/account_screen.dart';
import '../../sell/presentation/new_listing_screen.dart';
import '../../vehicles/presentation/vehicle_detail_screen.dart';

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient());
final homeRepositoryProvider = Provider<HomeRepository>(
  (ref) => HomeRepository(ref.watch(apiClientProvider)),
);
final homeDataProvider = FutureProvider<HomeData>(
  (ref) => ref.watch(homeRepositoryProvider).loadHome(),
);

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key, this.onLogout, this.isGuest = false});

  final VoidCallback? onLogout;
  final bool isGuest;

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  final _query = TextEditingController();
  final _make = TextEditingController();
  final _model = TextEditingController();
  String? _category;
  String _sort = 'newest';
  String _date = 'all';
  Future<List<Vehicle>>? _results;
  Timer? _publishedTimeRefresh;
  int selectedIndex = 0;

  @override
  void initState() {
    super.initState();
    _search();
    _publishedTimeRefresh = Timer.periodic(const Duration(minutes: 1), (_) {
      if (mounted && selectedIndex == 0) setState(() {});
    });
  }

  @override
  void dispose() {
    _publishedTimeRefresh?.cancel();
    _query.dispose();
    _make.dispose();
    _model.dispose();
    super.dispose();
  }

  void _search() {
    final now = DateTime.now();
    final since = _date == 'today'
        ? DateTime(now.year, now.month, now.day)
        : _date == 'week'
            ? now.subtract(const Duration(days: 7))
            : _date == 'month'
                ? now.subtract(const Duration(days: 30))
                : null;
    final results = ref.read(homeRepositoryProvider).searchVehicles(
          query: _query.text,
          make: _make.text,
          model: _model.text,
          category: _category,
          sort: _sort,
          dateFrom: since,
        );
    setState(() {
      _results = results;
    });
  }

  Widget _categoryChip(String? value, String label) => Padding(
        padding: const EdgeInsets.only(left: 6),
        child: ChoiceChip(
            label: Text(label),
            selected: _category == value,
            onSelected: (_) {
              _category = value;
              _search();
            }),
      );

  @override
  Widget build(BuildContext context) {
    final home = ref.watch(homeDataProvider);
    final narrowScreen = MediaQuery.sizeOf(context).width < 380;
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 16,
        title: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            PlatformLogo(size: 31, fallbackColor: Colors.white),
            SizedBox(width: 9),
            Flexible(
              child: Text('كارنا',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontWeight: FontWeight.w700)),
            ),
          ],
        ),
        actions: [
          IconButton(
              onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => DealersScreen(
                      isGuest: widget.isGuest, onLogin: widget.onLogout))),
              tooltip: 'المعارض',
              icon: const Icon(Icons.storefront_outlined)),
          if (!narrowScreen)
            IconButton(
                onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => TechniciansScreen(
                        isGuest: widget.isGuest, onLogin: widget.onLogout))),
                tooltip: 'الفنيون',
                icon: const Icon(Icons.build_outlined)),
          IconButton(
              onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => AccountScreen(
                      isGuest: widget.isGuest,
                      onLogin: widget.onLogout,
                      notificationsOnly: true))),
              tooltip: 'الإشعارات',
              icon: const Icon(Icons.notifications_none)),
          if (!narrowScreen)
            IconButton(
                onPressed: widget.onLogout,
                tooltip: 'تسجيل الخروج',
                icon: const Icon(Icons.logout)),
        ],
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.centerDocked,
      floatingActionButton: Tooltip(
        message: 'عرض مركبة',
        child: FloatingActionButton(
          onPressed: _openSellVehicle,
          backgroundColor: const Color(0xFF1769D2),
          foregroundColor: Colors.white,
          shape: const CircleBorder(),
          child: const Icon(Icons.add, size: 32),
        ),
      ),
      bottomNavigationBar: BottomAppBar(
        height: 72,
        padding: const EdgeInsets.symmetric(horizontal: 6),
        notchMargin: 7,
        shape: const CircularNotchedRectangle(),
        child: Row(
          children: [
            _bottomItem(0, Icons.home_outlined, Icons.home, 'الرئيسية'),
            _bottomItem(1, Icons.gavel_outlined, Icons.gavel, 'المزادات'),
            const SizedBox(width: 66),
            _bottomItem(2, Icons.build_outlined, Icons.build, 'الفنيون'),
            _bottomItem(3, Icons.person_outline, Icons.person, 'حسابي'),
          ],
        ),
      ),
      body: selectedIndex == 1
          ? AuctionsScreen(isGuest: widget.isGuest, onLogin: widget.onLogout)
          : selectedIndex == 2
              ? TechniciansScreen(
                  isGuest: widget.isGuest, onLogin: widget.onLogout)
              : selectedIndex == 3
                  ? AccountScreen(
                      isGuest: widget.isGuest, onLogin: widget.onLogout)
                  : home.when(
                      loading: () =>
                          const Center(child: CircularProgressIndicator()),
                      error: (error, _) => _ErrorView(
                          onRetry: () => ref.invalidate(homeDataProvider)),
                      data: (data) {
                        return RefreshIndicator(
                          onRefresh: () async {
                            ref.invalidate(platformBrandingProvider);
                            _search();
                            ref.invalidate(homeDataProvider);
                            await ref.read(homeDataProvider.future);
                          },
                          child: ListView(
                            padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                            children: [
                              TextField(
                                controller: _query,
                                onSubmitted: (_) => _search(),
                                decoration: InputDecoration(
                                  hintText: 'ابحث عن اسم المركبة',
                                  prefixIcon: const Icon(Icons.search),
                                  filled: true,
                                  fillColor: Colors.white,
                                  border: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(6),
                                    borderSide: const BorderSide(
                                        color: Color(0xFFD9E2EE)),
                                  ),
                                  enabledBorder: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(6),
                                    borderSide: const BorderSide(
                                        color: Color(0xFFD9E2EE)),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 10),
                              SizedBox(
                                  height: 42,
                                  child: ListView(
                                      scrollDirection: Axis.horizontal,
                                      children: [
                                        _categoryChip(null, 'الكل'),
                                        for (final entry
                                            in vehicleCategoryLabels.entries)
                                          _categoryChip(entry.key, entry.value),
                                      ])),
                              const SizedBox(height: 9),
                              Row(children: [
                                Expanded(
                                    child: TextField(
                                        controller: _make,
                                        onSubmitted: (_) => _search(),
                                        decoration: const InputDecoration(
                                            labelText: 'الشركة',
                                            isDense: true,
                                            border: OutlineInputBorder()))),
                                const SizedBox(width: 8),
                                Expanded(
                                    child: TextField(
                                        controller: _model,
                                        onSubmitted: (_) => _search(),
                                        decoration: const InputDecoration(
                                            labelText: 'الموديل',
                                            isDense: true,
                                            border: OutlineInputBorder()))),
                              ]),
                              const SizedBox(height: 9),
                              Row(children: [
                                Expanded(
                                    child: DropdownButtonFormField<String>(
                                        isExpanded: true,
                                        initialValue: _sort,
                                        decoration: const InputDecoration(
                                            labelText: 'الترتيب',
                                            isDense: true,
                                            border: OutlineInputBorder()),
                                        items: const [
                                          DropdownMenuItem(
                                              value: 'newest',
                                              child: Text('الأحدث')),
                                          DropdownMenuItem(
                                              value: 'oldest',
                                              child: Text('الأقدم')),
                                          DropdownMenuItem(
                                              value: 'price_asc',
                                              child: Text('الأقل سعراً')),
                                          DropdownMenuItem(
                                              value: 'price_desc',
                                              child: Text('الأعلى سعراً')),
                                        ],
                                        onChanged: (value) {
                                          _sort = value!;
                                          _search();
                                        })),
                                const SizedBox(width: 8),
                                Expanded(
                                    child: DropdownButtonFormField<String>(
                                        isExpanded: true,
                                        initialValue: _date,
                                        decoration: const InputDecoration(
                                            labelText: 'تاريخ النشر',
                                            isDense: true,
                                            border: OutlineInputBorder()),
                                        items: const [
                                          DropdownMenuItem(
                                              value: 'all',
                                              child: Text('كل التواريخ')),
                                          DropdownMenuItem(
                                              value: 'today',
                                              child: Text('اليوم')),
                                          DropdownMenuItem(
                                              value: 'week',
                                              child: Text('آخر أسبوع')),
                                          DropdownMenuItem(
                                              value: 'month',
                                              child: Text('آخر شهر')),
                                        ],
                                        onChanged: (value) {
                                          _date = value!;
                                          _search();
                                        })),
                              ]),
                              const SizedBox(height: 9),
                              FilledButton.icon(
                                  onPressed: _search,
                                  icon: const Icon(Icons.search),
                                  label: const Text('بحث')),
                              const SizedBox(height: 16),
                              _AuctionPanel(auction: data.liveAuction),
                              const SizedBox(height: 24),
                              const Text('المركبات المنشورة',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                      fontSize: 18,
                                      fontWeight: FontWeight.w700)),
                              const SizedBox(height: 12),
                              FutureBuilder<List<Vehicle>>(
                                  future: _results,
                                  builder: (context, snapshot) {
                                    if (!snapshot.hasData) {
                                      return Padding(
                                          padding: const EdgeInsets.all(30),
                                          child: Center(
                                              child: snapshot.hasError
                                                  ? TextButton.icon(
                                                      onPressed: _search,
                                                      icon: const Icon(
                                                          Icons.refresh),
                                                      label: const Text(
                                                          'تعذر البحث، أعد المحاولة'))
                                                  : const CircularProgressIndicator()));
                                    }
                                    final vehicles = snapshot.data!;
                                    if (vehicles.isEmpty) {
                                      return const _EmptyVehicles();
                                    }
                                    return Column(children: [
                                      Align(
                                          alignment: Alignment.centerRight,
                                          child: Text('${vehicles.length} عرض',
                                              style: const TextStyle(
                                                  color: Color(0xFF1769D2)))),
                                      const SizedBox(height: 10),
                                      LayoutBuilder(
                                          builder: (context, constraints) {
                                        final cardWidth =
                                            (constraints.maxWidth - 10) / 2;
                                        final imageHeight = (cardWidth * 0.72)
                                            .clamp(104.0, 160.0);
                                        return GridView.builder(
                                          shrinkWrap: true,
                                          physics:
                                              const NeverScrollableScrollPhysics(),
                                          itemCount: vehicles.length,
                                          gridDelegate:
                                              SliverGridDelegateWithFixedCrossAxisCount(
                                            crossAxisCount: 2,
                                            crossAxisSpacing: 10,
                                            mainAxisSpacing: 10,
                                            mainAxisExtent: imageHeight + 150,
                                          ),
                                          itemBuilder: (context, index) =>
                                              _VehicleCard(
                                            vehicle: vehicles[index],
                                            imageHeight: imageHeight,
                                            isGuest: widget.isGuest,
                                            onLogin: widget.onLogout,
                                          ),
                                        );
                                      }),
                                    ]);
                                  }),
                            ],
                          ),
                        );
                      },
                    ),
    );
  }

  Widget _bottomItem(
      int index, IconData icon, IconData selectedIcon, String label) {
    final selected = selectedIndex == index;
    return Expanded(
      child: InkWell(
        onTap: () => setState(() => selectedIndex = index),
        borderRadius: BorderRadius.circular(6),
        child: SizedBox(
          height: 58,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(selected ? selectedIcon : icon,
                  size: 23,
                  color: selected
                      ? const Color(0xFF1769D2)
                      : const Color(0xFF65748A)),
              const SizedBox(height: 3),
              Text(label,
                  maxLines: 1,
                  style: TextStyle(
                      fontSize: 10,
                      fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                      color: selected
                          ? const Color(0xFF1769D2)
                          : const Color(0xFF65748A))),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _openSellVehicle() async {
    if (widget.isGuest) {
      final login = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('سجّل الدخول أولاً'),
          content: const Text(
              'عرض مركبة وإرسالها للمراجعة متاح للحسابات المسجلة فقط.'),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('إلغاء')),
            FilledButton.icon(
                onPressed: () => Navigator.pop(context, true),
                icon: const Icon(Icons.login),
                label: const Text('تسجيل الدخول')),
          ],
        ),
      );
      if (login == true) widget.onLogout?.call();
      return;
    }
    final created = await Navigator.of(context).push<bool>(MaterialPageRoute(
      builder: (_) => const NewListingScreen(),
    ));
    if (created == true) {
      ref.invalidate(homeDataProvider);
      _search();
    }
  }
}

class _AuctionPanel extends StatelessWidget {
  const _AuctionPanel({required this.auction});
  final LiveAuction? auction;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(17),
      decoration: BoxDecoration(
          color: const Color(0xFF0B2347),
          border: Border.all(color: const Color(0xFF284F82)),
          borderRadius: BorderRadius.circular(6)),
      child: auction == null
          ? const Row(
              children: [
                Icon(Icons.gavel, color: Color(0xFF7DB5F5)),
                SizedBox(width: 12),
                Expanded(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                      Text('مزادات كارنا',
                          style: TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w700)),
                      SizedBox(height: 5),
                      Text('لا توجد جلسة مباشرة الآن',
                          style:
                              TextStyle(color: Color(0xFFB9C9DC), fontSize: 12))
                    ])),
              ],
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('مباشر الآن',
                    style: TextStyle(
                        color: Color(0xFFFF777D),
                        fontSize: 12,
                        fontWeight: FontWeight.w700)),
                const SizedBox(height: 7),
                Text(auction!.vehicle,
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 17,
                        fontWeight: FontWeight.w700)),
                const SizedBox(height: 12),
                Text(
                    '${_money(auction!.currentBidLyd)} د.ل · ${auction!.bidCount} مزايدة',
                    style: const TextStyle(color: Color(0xFF7DB5F5))),
              ],
            ),
    );
  }
}

class _VehicleCard extends StatelessWidget {
  const _VehicleCard(
      {required this.vehicle,
      required this.imageHeight,
      required this.isGuest,
      this.onLogin});
  final Vehicle vehicle;
  final double imageHeight;
  final bool isGuest;
  final VoidCallback? onLogin;

  @override
  Widget build(BuildContext context) {
    final categoryIcon = switch (vehicle.category) {
      'Truck' => Icons.local_shipping_outlined,
      'Motorcycle' || 'Bicycle' => Icons.two_wheeler,
      _ => Icons.directions_car_outlined,
    };
    final saleLabel = switch (vehicle.saleType) {
      'Auction' => 'مزاد',
      'QuickSale' => 'بيع سريع',
      'Negotiable' => 'قابل للتفاوض',
      _ => 'سعر ثابت',
    };
    return Card(
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
          onTap: () => Navigator.push(
              context,
              MaterialPageRoute(
                  builder: (_) => VehicleDetailScreen(
                      vehicleId: vehicle.id,
                      isGuest: isGuest,
                      onLogin: onLogin))),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(
                height: imageHeight,
                child: Stack(fit: StackFit.expand, children: [
                  ColoredBox(
                    color: const Color(0xFFEAF2FD),
                    child: vehicle.imageUrl == null
                        ? Icon(categoryIcon,
                            size: 42, color: const Color(0xFF1769D2))
                        : Image.network(
                            resolveApiUrl(vehicle.imageUrl!),
                            fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => Icon(categoryIcon,
                                size: 42, color: const Color(0xFF1769D2)),
                          ),
                  ),
                  Positioned(
                    right: 7,
                    bottom: 7,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                          color: const Color(0xE60B2347),
                          borderRadius: BorderRadius.circular(4)),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 7, vertical: 4),
                        child: Text(saleLabel,
                            style: const TextStyle(
                                color: Colors.white,
                                fontSize: 10,
                                fontWeight: FontWeight.w700)),
                      ),
                    ),
                  ),
                ]),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(9),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(vehicle.title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 13, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 4),
                      Text(
                          '${vehicleCategoryLabels[vehicle.category] ?? 'أخرى'} · ${vehicle.year} · ${vehicle.city ?? 'غير محددة'}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              color: Color(0xFF65758B), fontSize: 10)),
                      if (vehicle.publishedAt != null) ...[
                        const SizedBox(height: 5),
                        SizedBox(
                          height: 16,
                          child: Row(children: [
                            const Icon(Icons.schedule_outlined,
                                size: 12, color: Color(0xFF65758B)),
                            const SizedBox(width: 3),
                            Expanded(
                              child: FittedBox(
                                fit: BoxFit.scaleDown,
                                alignment: Alignment.centerRight,
                                child: Text(
                                    publishedDateRelative(vehicle.publishedAt!),
                                    style: const TextStyle(
                                        color: Color(0xFF65758B),
                                        fontSize: 10)),
                              ),
                            ),
                          ]),
                        ),
                      ],
                      const Spacer(),
                      const Text('السعر',
                          style: TextStyle(
                              color: Color(0xFF65758B), fontSize: 10)),
                      SizedBox(
                        height: 24,
                        width: double.infinity,
                        child: FittedBox(
                          fit: BoxFit.scaleDown,
                          alignment: Alignment.centerRight,
                          child: Text(
                              vehicle.priceLyd == null
                                  ? 'يحدد لاحقاً'
                                  : '${_money(vehicle.priceLyd!)} د.ل',
                              style: const TextStyle(
                                  color: Color(0xFF1356A8),
                                  fontSize: 16,
                                  fontWeight: FontWeight.w700)),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          )),
    );
  }
}

class _EmptyVehicles extends StatelessWidget {
  const _EmptyVehicles();
  @override
  Widget build(BuildContext context) => const Card(
      child: Padding(
          padding: EdgeInsets.symmetric(vertical: 48, horizontal: 20),
          child: Column(children: [
            Icon(Icons.directions_car_outlined,
                size: 40, color: Color(0xFF7B8798)),
            SizedBox(height: 12),
            Text('لا توجد مركبات مطابقة حالياً',
                style: TextStyle(fontWeight: FontWeight.w700)),
            SizedBox(height: 5),
            Text('جرّب تغيير الفلاتر أو ابحث باسم آخر.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Color(0xFF65758B), fontSize: 12))
          ])));
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.onRetry});
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) => Center(
      child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.cloud_off_outlined, size: 44),
            const SizedBox(height: 12),
            const Text('تعذر الاتصال بخادم المنصة'),
            const SizedBox(height: 12),
            FilledButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh),
                label: const Text('إعادة المحاولة'))
          ])));
}

String _money(double value) => NumberFormat('#,##0.###', 'ar_LY').format(value);
