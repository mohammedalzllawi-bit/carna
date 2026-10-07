import 'package:flutter/material.dart';
import 'package:intl/intl.dart' show DateFormat;
import '../../sell/presentation/new_listing_screen.dart';
import 'package:uuid/uuid.dart';
import '../../../core/api/api_client.dart';
import '../../vehicles/presentation/vehicle_detail_screen.dart';
import 'wallet_screen.dart';
import 'workspace_screen.dart';

class ProfileToolsScreen extends StatefulWidget {
  const ProfileToolsScreen(
      {super.key, required this.mode, this.onLogout, this.client});
  final ApiClient? client;
  final String mode;
  final VoidCallback? onLogout;
  @override
  State<ProfileToolsScreen> createState() => _ProfileToolsState();
}

class _ProfileToolsState extends State<ProfileToolsScreen> {
  late final api = widget.client ?? ApiClient();
  dynamic data;
  String? error;
  bool busy = false;
  final name = TextEditingController();
  final oldPassword = TextEditingController(),
      newPassword = TextEditingController();
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    name.dispose();
    oldPassword.dispose();
    newPassword.dispose();
    if (widget.client == null) api.dio.close();
    super.dispose();
  }

  String get path => switch (widget.mode) {
        'subscriptions' => '/v1/subscriptions/me',
        'dealer' => '/v1/dealer/me',
        'favorites' => '/v1/account/favorites/vehicles',
        'settings' => '/v1/workspace/settings',
        _ => '/v1/content/${widget.mode}'
      };
  Future<void> load() async {
    try {
      final response = await api.dio.get<dynamic>(path);
      if (mounted) {
        setState(() {
          data = response.data;
          if (widget.mode == 'settings') {
            name.text = '${data['fullName'] ?? ''}';
          }
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = accountError(e));
    }
  }

  Future<void> action(Future<void> Function() run) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await run();
      await load();
    } catch (e) {
      if (mounted) setState(() => error = accountError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  void wallet() => Navigator.push(
              context, MaterialPageRoute(builder: (_) => const WalletScreen()))
          .then((_) {
        if (mounted) load();
      });
  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(
          title: Text(const {
                'subscriptions': 'اشتراكات النشر',
                'dealer': 'واجهة المعرض',
                'favorites': 'المفضلة',
                'settings': 'إعدادات الحساب',
                'terms': 'الشروط والأحكام',
                'privacy': 'سياسة الخصوصية',
                'auction-rules': 'قواعد المزاد',
                'consumer-protection': 'حماية المستهلك'
              }[widget.mode] ??
              'الحساب')),
      body: data == null && error == null
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: load,
              child: ListView(padding: const EdgeInsets.all(18), children: [
                if (error != null)
                  Text(error!, style: const TextStyle(color: Colors.red)),
                if (data == null)
                  OutlinedButton.icon(
                      onPressed: load,
                      icon: const Icon(Icons.refresh),
                      label: const Text('إعادة المحاولة')),
                if (busy) const LinearProgressIndicator(),
                if (data != null) ...content(),
              ])));
  List<Widget> content() {
    if (widget.mode == 'subscriptions') {
      return [
        Text(
            data['required'] == true
                ? 'اشتراك فعّال مطلوب لنشر المزاد'
                : 'اشتراك النشر اختياري حالياً',
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
        const SizedBox(height: 12),
        const Text(
            'الباقة للنشر فقط. رسوم إدراج المركبة وتأمين المزايدة منفصلان وتظهر قبل الدفع.'),
        for (final s in data['subscriptions'] as List<dynamic>)
          ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.verified_outlined),
              title:
                  Text('${s['plan']['name']} · ${accountStatus(s['status'])}'),
              subtitle: Text(
                  'المزادات المستخدمة: ${s['usedAuctions']} / ${s['plan']['auctionLimit'] ?? 'غير محدود'}\nينتهي: ${s['endsAt'] == null ? 'لم يبدأ' : DateFormat('d MMM y · HH:mm', 'ar').format(DateTime.parse(s['endsAt'] as String).toLocal())}')),
        const Divider(height: 30),
        const Text('الباقات المتاحة',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
        if ((data['plans'] as List).isEmpty)
          const Padding(
              padding: EdgeInsets.symmetric(vertical: 20),
              child: Text('لا توجد باقات نشر متاحة. تواصل مع الإدارة.')),
        for (final p in data['plans'] as List<dynamic>)
          Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Card(
                  child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('${p['name']}',
                                style: const TextStyle(
                                    fontSize: 18, fontWeight: FontWeight.w700)),
                            const SizedBox(height: 8),
                            Text(
                                '${accountMoney(p['priceLyd'])} · ${p['durationDays']} يوم'),
                            Text('${p['auctionLimit'] ?? 'غير محدود'} مزاد'),
                            const SizedBox(height: 10),
                            FilledButton.icon(
                                onPressed: busy ? null : () => subscribe(p),
                                icon: const Icon(Icons.check),
                                label: const Text('اختيار الباقة')),
                          ])))),
        const SizedBox(height: 18),
        OutlinedButton.icon(
            onPressed: wallet,
            icon: const Icon(Icons.account_balance_wallet_outlined),
            label: const Text('طلبات الدفع والمحفظة')),
      ];
    }
    if (widget.mode == 'settings') {
      return [
        TextField(
            controller: name,
            decoration: const InputDecoration(labelText: 'الاسم')),
        const SizedBox(height: 12),
        Text('${data['phone']}', textDirection: TextDirection.ltr),
        for (final p in {
          'pushEnabled': 'إشعارات الهاتف',
          'auctionNotifications': 'تنبيهات المزادات',
          'messageNotifications': 'إشعارات الرسائل'
        }.entries)
          SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(p.value),
              value: data['preferences'][p.key] != false,
              onChanged: busy
                  ? null
                  : (v) => setState(() => data['preferences'][p.key] = v)),
        FilledButton.icon(
            onPressed: busy
                ? null
                : () => action(() async {
                      if (name.text.trim().length < 2) throw StateError('name');
                      await api.dio.patch('/v1/workspace/settings', data: {
                        'fullName': name.text.trim(),
                        ...Map<String, dynamic>.from(data['preferences'] as Map)
                      });
                    }),
            icon: const Icon(Icons.save_outlined),
            label: const Text('حفظ الإعدادات')),
        const Divider(height: 35),
        const Text('الأمان',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
        TextField(
            controller: oldPassword,
            obscureText: true,
            decoration:
                const InputDecoration(labelText: 'كلمة المرور الحالية')),
        TextField(
            controller: newPassword,
            obscureText: true,
            decoration: const InputDecoration(
                labelText: 'كلمة المرور الجديدة (12 حرفاً على الأقل)')),
        const SizedBox(height: 12),
        OutlinedButton.icon(
            onPressed: busy
                ? null
                : () => action(() async {
                      await api.dio.post('/v1/workspace/password', data: {
                        'currentPassword': oldPassword.text,
                        'newPassword': newPassword.text
                      });
                      if (mounted) {
                        Navigator.pop(context);
                        widget.onLogout?.call();
                      }
                    }),
            icon: const Icon(Icons.lock_outline),
            label: const Text('تغيير كلمة المرور والخروج من الجلسات')),
        for (final entry in {
          'terms': 'الشروط والأحكام',
          'privacy': 'الخصوصية',
          'auction-rules': 'قواعد المزاد',
          'consumer-protection': 'حماية المستهلك'
        }.entries)
          ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(entry.value),
              trailing: const Icon(Icons.chevron_left),
              onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                      builder: (_) => ProfileToolsScreen(mode: entry.key)))),
      ];
    }
    if (widget.mode == 'favorites') {
      return [
        if ((data as List).isEmpty)
          const Center(child: Text('لم تضف عروضاً إلى المفضلة بعد')),
        for (final v in data as List<dynamic>)
          ListTile(
              contentPadding: EdgeInsets.zero,
              leading: v['imageUrl'] == null
                  ? const Icon(Icons.directions_car_outlined)
                  : Image.network(resolveApiUrl(v['imageUrl'] as String),
                      width: 65,
                      height: 50,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) =>
                          const Icon(Icons.directions_car_outlined)),
              title: Text('${v['make']} ${v['model']} ${v['year']}'),
              trailing: IconButton(
                  tooltip: 'إزالة من المفضلة',
                  onPressed: busy
                      ? null
                      : () => action(() async {
                            await api.dio
                                .delete('/v1/account/favorites/${v['id']}');
                          }),
                  icon: const Icon(Icons.favorite, color: Colors.red)),
              onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                      builder: (_) => VehicleDetailScreen(
                          vehicleId: v['id'] as String,
                          isGuest: false))).then((_) => load())),
      ];
    }
    if (widget.mode == 'dealer') {
      return [
        Text('${data['dealer']['name']}',
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
        ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.verified),
            title: Text(data['currentSubscription'] == null
                ? 'لا يوجد اشتراك فعّال'
                : '${data['currentSubscription']['plan']['name']}'),
            subtitle:
                Text('التقييم: ${data['dealer']['ratingAverage'] ?? 0}/5')),
        OutlinedButton.icon(
            onPressed: () => Navigator.push(context,
                MaterialPageRoute(builder: (_) => const WorkspaceScreen())),
            icon: const Icon(Icons.inbox_outlined),
            label: const Text('طلبات شراء المعرض')),
        const Divider(height: 30),
        const Text('اشتراك المعرض',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
        for (final p in data['plans'] as List<dynamic>)
          ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text('${p['name']}'),
              subtitle: Text(
                  '${accountMoney(p['priceLyd'])} · ${p['durationDays']} يوم'),
              trailing: IconButton(
                  tooltip: 'طلب الاشتراك أو التجديد',
                  onPressed: busy
                      ? null
                      : () => action(() async {
                            await api.dio.post('/v1/dealer/subscriptions',
                                data: {'planId': p['id']});
                            wallet();
                          }),
                  icon: const Icon(Icons.autorenew))),
        const Divider(height: 30),
        OutlinedButton.icon(
            onPressed: () => Navigator.push(
                        context,
                        MaterialPageRoute(
                            builder: (_) =>
                                const NewListingScreen(dealerMode: true)))
                    .then((_) {
                  if (mounted) load();
                }),
            icon: const Icon(Icons.add),
            label: const Text('إضافة مركبة للمعرض')),
        const Text('مركبات المعرض',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
        for (final v in data['vehicles'] as List<dynamic>)
          ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text('${v['make']} ${v['model']} ${v['year']}'),
              subtitle: Text(accountStatus(v['approvalStatus'])),
              trailing: v['approvalStatus'] == 'Draft'
                  ? PopupMenuButton<String>(
                      enabled: !busy,
                      tooltip: 'إجراءات المركبة',
                      onSelected: (choice) {
                        if (choice == 'auction') {
                          dealerAuction(v as Map);
                        } else {
                          action(() async {
                            await api.dio
                                .post('/v1/dealer/vehicles/${v['id']}/submit');
                          });
                        }
                      },
                      itemBuilder: (_) => [
                        const PopupMenuItem(
                            value: 'review',
                            child: ListTile(
                                leading: Icon(Icons.send_outlined),
                                title: Text('إرسال للمراجعة'))),
                        if ((data['currentSubscription']?['plan']
                                    ?['permissions'] as List? ??
                                [])
                            .contains('CAN_CREATE_AUCTION'))
                          const PopupMenuItem(
                              value: 'auction',
                              child: ListTile(
                                  leading: Icon(Icons.gavel),
                                  title: Text('إرسال للمزاد'))),
                      ],
                    )
                  : null),
        const Divider(),
        const Text('التقييمات',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
        for (final r in data['reviews'] as List<dynamic>)
          ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.star, color: Colors.amber),
              title: Text('${r['rating']}/5 · ${r['reviewerName']}'),
              subtitle: Text('${r['comment'] ?? ''}')),
      ];
    }
    return [
      Text('${data['title']}',
          style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
      const SizedBox(height: 20),
      SelectableText('${data['body']}', style: const TextStyle(height: 1.8))
    ];
  }

  Future<void> dealerAuction(Map<dynamic, dynamic> vehicle) async {
    final date = await showDatePicker(
        context: context,
        initialDate: DateTime.now().add(const Duration(days: 1)),
        firstDate: DateTime.now(),
        lastDate: DateTime.now().add(const Duration(days: 365)));
    if (date == null || !mounted) return;
    final time = await showTimePicker(
        context: context, initialTime: const TimeOfDay(hour: 20, minute: 0));
    if (time == null || !mounted) return;
    final start =
        DateTime(date.year, date.month, date.day, time.hour, time.minute);
    final price = TextEditingController(), reserve = TextEditingController();
    final form = GlobalKey<FormState>();
    Map<String, dynamic>? payload;
    try {
      payload = await showDialog<Map<String, dynamic>>(
          context: context,
          builder: (context) => AlertDialog(
                title: const Text('طلب مزاد للمعرض'),
                content: SingleChildScrollView(
                    child: Form(
                        key: form,
                        child:
                            Column(mainAxisSize: MainAxisSize.min, children: [
                          Text(
                              '${vehicle['make']} ${vehicle['model']} · ${DateFormat('d MMM y · HH:mm', 'ar').format(start)}'),
                          const SizedBox(height: 14),
                          TextFormField(
                              controller: price,
                              decoration: const InputDecoration(
                                  labelText: 'السعر الابتدائي (د.ل)'),
                              keyboardType:
                                  const TextInputType.numberWithOptions(
                                      decimal: true),
                              validator: (v) =>
                                  (num.tryParse(v ?? '') ?? 0) <= 0
                                      ? 'أدخل مبلغاً أكبر من صفر'
                                      : null),
                          const SizedBox(height: 12),
                          TextFormField(
                              controller: reserve,
                              decoration: const InputDecoration(
                                  labelText: 'السعر الاحتياطي (اختياري)'),
                              keyboardType:
                                  const TextInputType.numberWithOptions(
                                      decimal: true),
                              validator: (v) => v == null ||
                                      v.trim().isEmpty ||
                                      (num.tryParse(v) ?? -1) >= 0
                                  ? null
                                  : 'أدخل مبلغاً صحيحاً'),
                        ]))),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('إلغاء')),
                  FilledButton(
                      onPressed: () {
                        if (form.currentState!.validate()) {
                          Navigator.pop(context, <String, dynamic>{
                            'startsAt': start.toUtc().toIso8601String(),
                            'rollingRound': true,
                            'startingPriceLyd': price.text.trim(),
                            if (reserve.text.trim().isNotEmpty)
                              'reservePriceLyd': reserve.text.trim(),
                          });
                        }
                      },
                      child: const Text('إرسال للمراجعة'))
                ],
              ));
    } finally {
      price.dispose();
      reserve.dispose();
    }
    if (payload != null && mounted) {
      await action(() async {
        await api.dio.post('/v1/dealer/vehicles/${vehicle['id']}/auction',
            data: payload);
      });
    }
  }

  Future<void> subscribe(Map<dynamic, dynamic> p) async {
    final yes = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
                title: const Text('تأكيد الاشتراك'),
                content: Text(
                    '${p['name']} · ${accountMoney(p['priceLyd'])}\nالمدة ${p['durationDays']} يوم. يبدأ التفعيل بعد الدفع.'),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: const Text('إلغاء')),
                  FilledButton(
                      onPressed: () => Navigator.pop(context, true),
                      child: const Text('إنشاء طلب الدفع'))
                ]));
    if (yes == true && mounted) {
      await action(() async {
        await api.dio.post('/v1/subscriptions',
            data: {'planId': p['id'], 'idempotencyKey': const Uuid().v4()});
        wallet();
      });
    }
  }
}

class FavoriteButton extends StatefulWidget {
  const FavoriteButton(
      {super.key,
      required this.vehicleId,
      required this.isGuest,
      this.onLogin});
  final String vehicleId;
  final bool isGuest;
  final VoidCallback? onLogin;
  @override
  State<FavoriteButton> createState() => _FavoriteButtonState();
}

class _FavoriteButtonState extends State<FavoriteButton> {
  final api = ApiClient();
  bool favorite = false, busy = false;
  @override
  void initState() {
    super.initState();
    if (!widget.isGuest) load();
  }

  Future<void> load() async {
    try {
      final r = await api.dio.get<List<dynamic>>('/v1/account/favorites');
      if (mounted) {
        setState(() => favorite =
            (r.data ?? []).any((v) => v['vehicleId'] == widget.vehicleId));
      }
    } catch (_) {/* Details stay available if the account is offline. */}
  }

  @override
  void dispose() {
    api.dio.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => IconButton(
      tooltip: favorite ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة',
      icon: Icon(favorite ? Icons.favorite : Icons.favorite_border,
          color: favorite ? Colors.red : null),
      onPressed: busy
          ? null
          : () async {
              if (widget.isGuest) {
                widget.onLogin?.call();
                return;
              }
              setState(() => busy = true);
              try {
                if (favorite) {
                  await api.dio
                      .delete('/v1/account/favorites/${widget.vehicleId}');
                } else {
                  await api.dio
                      .post('/v1/account/favorites/${widget.vehicleId}');
                }
                if (mounted) setState(() => favorite = !favorite);
              } catch (e) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context)
                      .showSnackBar(SnackBar(content: Text(accountError(e))));
                }
              } finally {
                if (mounted) setState(() => busy = false);
              }
            });
}
