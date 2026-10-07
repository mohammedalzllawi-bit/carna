import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:uuid/uuid.dart';
import '../../../core/api/api_client.dart';

String accountError(Object error) {
  final data = error is DioException ? error.response?.data : null;
  final code = data is Map ? '${data['message']}' : '';
  if (code.contains('insufficient_balance')) {
    return 'الرصيد غير كافٍ أو تغيّر أثناء العملية. راجع الرصيد ثم حاول مجدداً.';
  }
  if (code.contains('auction_commitment')) {
    return 'رصيد التأمين مرتبط بمزاد جارٍ. انتظر انتهاء المزاد وتسوية الالتزامات.';
  }
  if (code.contains('subscription.')) {
    return 'يلزم اشتراك نشر فعّال بصلاحية المزاد وحصة متاحة. راجع قسم الاشتراكات.';
  }
  if (code.contains('completed_')) {
    return 'التقييم متاح بعد إكمال الشراء أو الفحص.';
  }
  if (code.contains('invalid_transition')) {
    return 'تغيّرت حالة الطلب أو أن الإجراء غير متاح. حدّث الطلبات.';
  }
  if (code.contains('already_in_progress')) {
    return 'يوجد دفع قيد المعالجة. راجع حالته قبل المحاولة.';
  }
  if (code.contains('not_payable')) return 'الطلب مدفوع أو انتهت مهلة دفعه.';
  if (code.contains('city_mismatch')) return 'اختر فنياً يخدم مدينة المركبة.';
  if (code.contains('auth.invalid_credentials')) {
    return 'كلمة المرور الحالية غير صحيحة.';
  }
  return 'تعذر إكمال العملية. تحقق من البيانات والاتصال ثم حاول مجدداً.';
}

String accountMoney(dynamic value) =>
    '${NumberFormat('#,##0.###', 'ar').format(num.tryParse('$value') ?? 0)} د.ل';
String accountStatus(dynamic value) =>
    const {
      'Pending': 'بانتظار المراجعة',
      'PaymentPending': 'بانتظار الدفع',
      'Paid': 'مدفوع',
      'Active': 'فعّال',
      'Suspended': 'موقوف',
      'Cancelled': 'ملغى',
      'Expired': 'منتهي',
      'Rejected': 'مرفوض',
      'Accepted': 'مقبول',
      'Delivered': 'بانتظار تأكيد المشتري',
      'Completed': 'مكتمل',
      'Scheduled': 'مجدول',
      'InProgress': 'قيد التنفيذ',
      'ReportSubmitted': 'التقرير جاهز',
      'RejectedByTechnician': 'رفضه الفني',
      'Refunded': 'مسترد',
      'Draft': 'مسودة',
      'Published': 'منشور',
      'PendingReview': 'قيد المراجعة',
    }[value] ??
    '$value';

class WalletScreen extends StatefulWidget {
  const WalletScreen({super.key, this.client});
  final ApiClient? client;
  @override
  State<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends State<WalletScreen> {
  late final api = widget.client ?? ApiClient();
  Map<String, dynamic>? wallet;
  List<dynamic> orders = [], providers = [];
  String? error;
  bool busy = false, loading = false;
  Timer? timer;
  @override
  void initState() {
    super.initState();
    load();
    timer = Timer.periodic(const Duration(seconds: 15), (_) => load());
  }

  @override
  void dispose() {
    timer?.cancel();
    if (widget.client == null) api.dio.close();
    super.dispose();
  }

  Future<void> load() async {
    if (loading || busy) return;
    loading = true;
    try {
      final w = await api.dio.get<Map<String, dynamic>>('/v1/wallet');
      final o = await api.dio.get<List<dynamic>>('/v1/payments/orders');
      final p = await api.dio.get<List<dynamic>>('/v1/payments/providers');
      if (mounted) {
        setState(() {
          wallet = w.data;
          orders = o.data ?? [];
          providers = p.data ?? [];
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = accountError(e));
    } finally {
      loading = false;
    }
  }

  Future<void> act(Future<void> Function() action) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await action();
    } catch (e) {
      if (mounted) setState(() => error = accountError(e));
    } finally {
      if (mounted) {
        setState(() => busy = false);
        await load();
      }
    }
  }

  Future<void> withdraw() async {
    final amount = TextEditingController(), reason = TextEditingController();
    final submit = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
                title: const Text('طلب استرداد الرصيد'),
                content: SingleChildScrollView(
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Text(
                      'يُحجز مبلغ الطلب حتى مراجعة الإدارة وتنفيذ التحويل. عند رفضه يعود إلى المحفظة.'),
                  TextField(
                      controller: amount,
                      keyboardType:
                          const TextInputType.numberWithOptions(decimal: true),
                      decoration:
                          const InputDecoration(labelText: 'المبلغ بالدينار')),
                  TextField(
                      controller: reason,
                      maxLength: 500,
                      decoration: const InputDecoration(
                          labelText: 'سبب الاسترداد وطريقة التواصل')),
                ])),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: const Text('إلغاء')),
                  FilledButton(
                      onPressed: () {
                        if ((num.tryParse(amount.text) ?? 0) > 0 &&
                            reason.text.trim().length >= 3) {
                          Navigator.pop(context, true);
                        }
                      },
                      child: const Text('إرسال الطلب'))
                ]));
    final data = {
      'amountLyd': amount.text.trim(),
      'reason': reason.text.trim(),
      'idempotencyKey': const Uuid().v4()
    };
    amount.dispose();
    reason.dispose();
    if (submit == true && mounted) {
      await act(() async {
        await api.dio.post('/v1/wallet/withdrawals', data: data);
      });
    }
  }

  Future<void> topup() async {
    if (providers.isEmpty) {
      setState(() => error =
          'الشحن الإلكتروني غير متاح حتى تفعيل مزود دفع رسمي. تواصل مع الدعم.');
      return;
    }
    final amount = TextEditingController();
    String provider = providers.first['code'] as String;
    final yes = await showDialog<bool>(
        context: context,
        builder: (context) => StatefulBuilder(
            builder: (context, update) => AlertDialog(
                    title: const Text('شحن المحفظة'),
                    content: Column(mainAxisSize: MainAxisSize.min, children: [
                      TextField(
                          controller: amount,
                          keyboardType: const TextInputType.numberWithOptions(
                              decimal: true),
                          decoration: const InputDecoration(
                              labelText: 'المبلغ بالدينار')),
                      DropdownButtonFormField<String>(
                          initialValue: provider,
                          items: [
                            for (final p in providers)
                              DropdownMenuItem(
                                  value: p['code'] as String,
                                  child: Text('${p['name']}'))
                          ],
                          onChanged: (v) => update(() => provider = v!)),
                    ]),
                    actions: [
                      TextButton(
                          onPressed: () => Navigator.pop(context, false),
                          child: const Text('إلغاء')),
                      FilledButton(
                          onPressed: () {
                            if ((num.tryParse(amount.text) ?? 0) > 0) {
                              Navigator.pop(context, true);
                            }
                          },
                          child: const Text('متابعة الدفع'))
                    ])));
    final value = amount.text.trim();
    amount.dispose();
    if (yes != true || !mounted) return;
    await act(() async {
      final order = await api.dio.post<Map<String, dynamic>>(
          '/v1/payments/wallet/topups',
          data: {'amountLyd': value, 'idempotencyKey': const Uuid().v4()});
      final payment =
          await api.dio.post<Map<String, dynamic>>('/v1/payments', data: {
        'orderId': order.data!['id'],
        'provider': provider,
        'idempotencyKey': const Uuid().v4()
      });
      final uri = Uri.tryParse('${payment.data?['checkoutUrl']}');
      if (uri == null ||
          uri.scheme != 'https' ||
          !await launchUrl(uri, mode: LaunchMode.externalApplication)) {
        throw StateError('checkout unavailable');
      }
    });
  }

  Future<void> pay(Map<dynamic, dynamic> order) async {
    final confirm = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
                title: const Text('تأكيد الدفع'),
                content: Text(
                    'سيُخصم ${accountMoney(order['totalLyd'])} من رصيدك مقابل ${_orderName(order['type'])}.'),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: const Text('إلغاء')),
                  FilledButton(
                      onPressed: () => Navigator.pop(context, true),
                      child: const Text('تأكيد'))
                ]));
    if (confirm == true && mounted) {
      await act(() async {
        await api.dio.post('/v1/payments/orders/${order['id']}/wallet',
            data: {'idempotencyKey': const Uuid().v4()});
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final accounts = wallet?['accounts'] as List<dynamic>? ?? [];
    final balance = accounts
            .where((a) => a['currency'] == 'LYD')
            .firstOrNull?['balanceLyd'] ??
        0;
    final entries = wallet?['entries'] as List<dynamic>? ?? [];
    return Scaffold(
        appBar: AppBar(title: const Text('المحفظة')),
        body: wallet == null && error == null
            ? const Center(child: CircularProgressIndicator())
            : RefreshIndicator(
                onRefresh: load,
                child: ListView(padding: const EdgeInsets.all(18), children: [
                  Container(
                      padding: const EdgeInsets.all(22),
                      decoration: BoxDecoration(
                          color: Theme.of(context).colorScheme.primary,
                          borderRadius: BorderRadius.circular(8)),
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Row(children: [
                              Icon(Icons.account_balance_wallet_outlined,
                                  color: Colors.white),
                              SizedBox(width: 10),
                              Text('الرصيد المتاح',
                                  style: TextStyle(color: Colors.white))
                            ]),
                            const SizedBox(height: 18),
                            Text(accountMoney(balance),
                                style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 30,
                                    fontWeight: FontWeight.w800)),
                          ])),
                  const SizedBox(height: 14),
                  Wrap(spacing: 10, runSpacing: 8, children: [
                    FilledButton.icon(
                        onPressed: busy ? null : topup,
                        icon: const Icon(Icons.add),
                        label: const Text('شحن الرصيد')),
                    OutlinedButton.icon(
                        onPressed: busy ? null : withdraw,
                        icon: const Icon(Icons.south_west),
                        label: const Text('طلب استرداد'))
                  ]),
                  const Padding(
                      padding: EdgeInsets.symmetric(vertical: 18),
                      child: Text(
                          'رصيد المزايدة تأمين للأهلية، ولا يُخصم لمجرد المزايدة. يمكنك طلب استرداده بعد نهاية المزاد وتسوية الالتزامات. رسوم النشر والاشتراك والعربون مبالغ منفصلة.')),
                  if (error != null)
                    Text(error!, style: const TextStyle(color: Colors.red)),
                  if (busy) const LinearProgressIndicator(),
                  const Divider(height: 30),
                  const Text('طلبات الدفع',
                      style:
                          TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                  for (final o in orders)
                    ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(_orderName(o['type'])),
                        subtitle: Text(accountStatus(o['status'])),
                        trailing: Text(accountMoney(o['totalLyd'])),
                        onTap: busy ||
                                o['status'] != 'PaymentPending' ||
                                o['type'] == 'WalletRecharge'
                            ? null
                            : () => pay(o as Map)),
                  const Divider(height: 30),
                  const Text('سجل الحركات',
                      style:
                          TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                  if (entries.isEmpty)
                    const Padding(
                        padding: EdgeInsets.all(20),
                        child: Text('لا توجد حركات بعد')),
                  for (final e in entries)
                    ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: Icon(
                            e['direction'] == 'Credit'
                                ? Icons.south_west
                                : Icons.north_east,
                            color: e['direction'] == 'Credit'
                                ? Colors.green
                                : Colors.red),
                        title: Text(_orderName(e['type'])),
                        subtitle: Text(DateFormat('d MMM y · HH:mm', 'ar')
                            .format(DateTime.parse(e['createdAt'] as String)
                                .toLocal())),
                        trailing: Text(
                            '${e['direction'] == 'Credit' ? '+' : '-'} ${accountMoney(e['amountLyd'])}')),
                  const Divider(),
                  const Text('طلبات الاسترداد',
                      style:
                          TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                  for (final w
                      in wallet?['withdrawals'] as List<dynamic>? ?? [])
                    ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(accountMoney(w['amountLyd'])),
                        subtitle: Text(accountStatus(w['status']))),
                ])));
  }
}

String _orderName(dynamic type) =>
    const {
      'AuctionDeposit': 'عربون المزاد',
      'AuctionListingFee': 'رسوم نشر المزاد',
      'InspectionFee': 'رسوم الفحص',
      'MemberSubscription': 'اشتراك النشر',
      'DealerSubscription': 'اشتراك المعرض',
      'WalletRecharge': 'شحن المحفظة',
      'ExternalPayment': 'دفع إلكتروني',
      'AdminAdjustment': 'تسوية إدارية',
      'WithdrawalReservation': 'حجز مبلغ الاسترداد',
      'WithdrawalReleased': 'إعادة مبلغ الاسترداد',
      'InspectionRefund': 'استرداد رسوم الفحص'
    }[type] ??
    'حركة مالية';
