import 'dart:async';

import 'package:flutter/material.dart';
import '../../../core/api/api_client.dart';
import '../../auctions/presentation/auctions_screen.dart';
import '../../sell/presentation/my_listings_screen.dart';
import '../../vehicles/presentation/inbox_screen.dart';
import 'wallet_screen.dart';
import 'workspace_screen.dart';
import 'profile_tools_screen.dart';

class AccountScreen extends StatefulWidget {
  const AccountScreen(
      {super.key,
      required this.isGuest,
      this.onLogin,
      this.notificationsOnly = false});
  final bool isGuest;
  final VoidCallback? onLogin;
  final bool notificationsOnly;
  @override
  State<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends State<AccountScreen> {
  final client = ApiClient();
  Timer? refresh;
  List<dynamic>? cached;
  late Future<List<dynamic>> data = load();

  @override
  void initState() {
    super.initState();
    if (!widget.isGuest) {
      refresh = Timer.periodic(const Duration(seconds: 15), (_) => _reload());
    }
  }

  @override
  void didUpdateWidget(covariant AccountScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.isGuest == widget.isGuest &&
        oldWidget.notificationsOnly == widget.notificationsOnly) {
      return;
    }
    refresh?.cancel();
    refresh = widget.isGuest
        ? null
        : Timer.periodic(const Duration(seconds: 15), (_) => _reload());
    cached = null;
    data = load();
  }

  @override
  void dispose() {
    refresh?.cancel();
    super.dispose();
  }

  void _reload() {
    final next = load();
    setState(() {
      data = next;
    });
  }

  Future<List<dynamic>> load() async {
    if (widget.isGuest) return [];
    final result = widget.notificationsOnly
        ? (await client.dio.get<List<dynamic>>('/v1/notifications')).data ?? []
        : await Future.wait([
            '/v1/payments/orders',
            '/v1/wallet',
            '/v1/auction-listings',
            '/v1/auth/me',
          ].map((path) async {
            try {
              return (await client.dio.get<dynamic>(path)).data;
            } catch (_) {
              if (path == '/v1/auction-listings') return <dynamic>[];
              rethrow;
            }
          }));
    cached = result;
    return result;
  }

  @override
  Widget build(BuildContext context) {
    if (widget.isGuest) {
      return Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.person_outline, size: 45),
        const SizedBox(height: 12),
        const Text('أنت تتصفح كضيف'),
        const SizedBox(height: 12),
        FilledButton(
            onPressed: widget.onLogin, child: const Text('تسجيل الدخول'))
      ]));
    }
    return FutureBuilder<List<dynamic>>(
        future: data,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting &&
              cached == null) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError && cached == null) {
            return Center(
                child: FilledButton(
                    onPressed: _reload, child: const Text('إعادة المحاولة')));
          }
          if (widget.notificationsOnly) {
            return Scaffold(
                appBar: AppBar(title: const Text('الإشعارات')),
                body: ListView(children: [
                  for (final item in snapshot.data ?? cached ?? [])
                    ListTile(
                        leading: const Icon(Icons.notifications_none),
                        title: Text('${item['title']}'),
                        subtitle: Text('${item['body']}'),
                        onTap: () async {
                          await client.dio
                              .patch('/v1/notifications/${item['id']}/read');
                          if (mounted) _reload();
                        })
                ]));
          }
          final current = snapshot.data ?? cached!;
          final orders = current[0] as List<dynamic>;
          final wallet = current[1] as Map<String, dynamic>;
          final listings = current[2] as List<dynamic>;
          final roles = current[3]['roles'] as List<dynamic>? ?? [];
          return ListView(padding: const EdgeInsets.all(18), children: [
            Text('${current[3]['fullName'] ?? 'حسابي'}',
                style:
                    const TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
            ListTile(
                leading: const Icon(Icons.account_balance_wallet_outlined),
                title: const Text('المحفظة'),
                subtitle: Text(
                    'الرصيد: ${accountMoney((wallet['accounts'] as List).where((a) => a['currency'] == 'LYD').firstOrNull?['balanceLyd'] ?? 0)}'),
                trailing: const Icon(Icons.chevron_left),
                onTap: () => Navigator.push(
                        context,
                        MaterialPageRoute(
                            builder: (_) => const WalletScreen())).then((_) {
                      if (mounted) _reload();
                    })),
            ListTile(
                leading: const Icon(Icons.inbox_outlined),
                title: const Text('طلبات الشراء والفحص'),
                trailing: const Icon(Icons.chevron_left),
                onTap: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                        builder: (_) => const WorkspaceScreen()))),
            if (roles.contains('TECHNICIAN'))
              ListTile(
                  leading: const Icon(Icons.build_outlined),
                  title: const Text('واجهة الفني'),
                  trailing: const Icon(Icons.chevron_left),
                  onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                          builder: (_) =>
                              const WorkspaceScreen(technician: true)))),
            for (final entry in {
              'subscriptions': (
                'اشتراكات النشر',
                Icons.workspace_premium_outlined
              ),
              'favorites': ('المفضلة', Icons.favorite_border),
              'settings': ('إعدادات الحساب', Icons.settings_outlined),
              if (roles.contains('DEALER_OWNER'))
                'dealer': ('واجهة المعرض', Icons.store_outlined)
            }.entries)
              ListTile(
                  leading: Icon(entry.value.$2),
                  title: Text(entry.value.$1),
                  trailing: const Icon(Icons.chevron_left),
                  onTap: () => Navigator.push(
                          context,
                          MaterialPageRoute(
                              builder: (_) => ProfileToolsScreen(
                                  mode: entry.key,
                                  onLogout: widget.onLogin))).then((_) {
                        if (mounted) _reload();
                      })),
            ListTile(
                leading: const Icon(Icons.sell_outlined),
                title: const Text('إعلاناتي'),
                trailing: const Icon(Icons.chevron_left),
                onTap: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                        builder: (_) => const MyListingsScreen()))),
            ListTile(
                leading: const Icon(Icons.chat_bubble_outline),
                title: const Text('الرسائل'),
                trailing: const Icon(Icons.chevron_left),
                onTap: () => Navigator.push(context,
                    MaterialPageRoute(builder: (_) => const InboxScreen()))),
            const Divider(height: 24),
            const Text('مزاداتي',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            for (final listing in listings)
              if (listing['vehicle']?['auctionId'] != null)
                ListTile(
                  leading: const Icon(Icons.gavel_outlined),
                  title: Text(
                      '${listing['vehicle']['make']} ${listing['vehicle']['model']} ${listing['vehicle']['year']}'),
                  subtitle: Text('${listing['vehicle']['lotNumber']}'),
                  trailing: const Icon(Icons.chevron_left),
                  onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => AuctionDetailsScreen(
                          id: listing['vehicle']['auctionId'] as String,
                          isGuest: false,
                          onLogin: widget.onLogin,
                        ),
                      )).then((_) {
                    if (mounted) _reload();
                  }),
                ),
            const Text('المشتريات والعربونات',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            if (orders.isEmpty)
              const Padding(
                  padding: EdgeInsets.symmetric(vertical: 24),
                  child: Text('لا توجد طلبات شراء')),
            for (final order in orders)
              ListTile(
                  title: Text('${order['type']} · ${order['status']}'),
                  subtitle: Text(
                      'الرسوم: ${order['feesLyd']} د.ل\n${order['expiresAt'] ?? ''}'),
                  trailing: Text('${order['totalLyd']} د.ل')),
          ]);
        });
  }
}
