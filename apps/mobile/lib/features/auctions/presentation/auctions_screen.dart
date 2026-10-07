import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'package:uuid/uuid.dart';

import '../../../core/api/api_client.dart';
import 'package:intl/intl.dart' show DateFormat;
import '../../account/presentation/wallet_screen.dart';
import '../../account/presentation/profile_tools_screen.dart';
import '../../account/presentation/workspace_screen.dart';

const _blue = Color(0xFF1769D2);
const _darkBlue = Color(0xFF0B2347);
const _softBlue = Color(0xFFF1F6FD);
const _line = Color(0xFFD9E2EE);
const _muted = Color(0xFF65758B);
const _danger = Color(0xFFC0323C);
const _success = Color(0xFF218653);

class AuctionWatchButton extends StatefulWidget {
  const AuctionWatchButton(
      {super.key,
      required this.auctionId,
      required this.isGuest,
      this.onLogin});
  final String auctionId;
  final bool isGuest;
  final VoidCallback? onLogin;
  @override
  State<AuctionWatchButton> createState() => _AuctionWatchButtonState();
}

class _AuctionWatchButtonState extends State<AuctionWatchButton> {
  final api = ApiClient();
  bool enabled = false, busy = false;
  @override
  void initState() {
    super.initState();
    if (!widget.isGuest) load();
  }

  Future<void> load() async {
    try {
      final r = await api.dio.get<List<dynamic>>('/v1/workspace/watches');
      if (mounted) {
        setState(() => enabled =
            (r.data ?? []).any((w) => w['auctionId'] == widget.auctionId));
      }
    } catch (_) {/* Public schedules remain available. */}
  }

  @override
  void dispose() {
    api.dio.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => IconButton(
      tooltip: enabled ? 'إلغاء تذكيرات المزاد' : 'تذكيري بالمزاد',
      icon:
          Icon(enabled ? Icons.notifications_active : Icons.notifications_none),
      onPressed: busy
          ? null
          : () async {
              if (widget.isGuest) {
                widget.onLogin?.call();
                return;
              }
              setState(() => busy = true);
              try {
                final response = enabled
                    ? await api.dio.delete<Map<String, dynamic>>(
                        '/v1/workspace/watches/${widget.auctionId}')
                    : await api.dio.post<Map<String, dynamic>>(
                        '/v1/workspace/watches/${widget.auctionId}');
                if (context.mounted) {
                  setState(() => enabled = !enabled);
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                      content: Text(enabled
                          ? 'التذكيرات مفعّلة قبل ${(response.data?['reminderMinutes'] as List?)?.join('، ') ?? ''} دقيقة من البداية، حسب إعدادات الإشعارات.'
                          : 'تم إلغاء التذكيرات')));
                }
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

String _money(dynamic value) {
  final number = value is num ? value : num.tryParse('$value') ?? 0;
  final text = number == number.roundToDouble()
      ? number.toStringAsFixed(0)
      : number
          .toStringAsFixed(3)
          .replaceFirst(RegExp(r'0+$'), '')
          .replaceFirst(RegExp(r'\.$'), '');
  return '$text د.ل';
}

class AuctionsScreen extends StatefulWidget {
  const AuctionsScreen({super.key, required this.isGuest, this.onLogin});

  final bool isGuest;
  final VoidCallback? onLogin;

  @override
  State<AuctionsScreen> createState() => _AuctionsScreenState();
}

class _AuctionsScreenState extends State<AuctionsScreen> {
  final client = ApiClient();
  List<dynamic>? cached;
  Timer? refresh;
  late Future<List<dynamic>> items = load();
  @override
  void initState() {
    super.initState();
    refresh = Timer.periodic(const Duration(seconds: 10), (_) => _reload());
  }

  @override
  void dispose() {
    refresh?.cancel();
    super.dispose();
  }

  void _reload() {
    final next = load();
    setState(() {
      items = next;
    });
  }

  Future<List<dynamic>> load() async {
    final next =
        (await client.dio.get<List<dynamic>>('/v1/auctions')).data ?? [];
    cached = next;
    return next;
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<dynamic>>(
      future: items,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting &&
            cached == null) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError && cached == null) {
          return Center(
            child: FilledButton.icon(
              onPressed: _reload,
              icon: const Icon(Icons.refresh),
              label: const Text('إعادة تحميل المزادات'),
            ),
          );
        }
        final auctions = snapshot.data ?? cached ?? [];
        if (auctions.isEmpty) {
          return const Center(child: Text('لا توجد مزادات متاحة حالياً'));
        }
        return RefreshIndicator(
          onRefresh: () async {
            _reload();
            await items;
          },
          child: ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: auctions.length,
            separatorBuilder: (_, __) => const SizedBox(height: 12),
            itemBuilder: (context, index) {
              final auction = auctions[index] as Map<String, dynamic>;
              final car = auction['vehicle'] as Map<String, dynamic>;
              final image = car['imageUrl'] as String?;
              final isLive = auction['status'] == 'Live';
              return Material(
                color: Colors.white,
                shape: RoundedRectangleBorder(
                  side: const BorderSide(color: _line),
                  borderRadius: BorderRadius.circular(8),
                ),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => AuctionDetailsScreen(
                        id: auction['id'] as String,
                        isGuest: widget.isGuest,
                        onLogin: widget.onLogin,
                      ),
                    ),
                  ).then((_) {
                    if (mounted) _reload();
                  }),
                  child: Row(
                    children: [
                      SizedBox(
                        width: 116,
                        height: 112,
                        child: image != null
                            ? Image.network(
                                resolveApiUrl(image),
                                fit: BoxFit.cover,
                                errorBuilder: (_, __, ___) => const Icon(
                                    Icons.directions_car_outlined,
                                    size: 42),
                              )
                            : const ColoredBox(
                                color: _softBlue,
                                child: Icon(Icons.directions_car_outlined,
                                    color: _blue, size: 42),
                              ),
                      ),
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.all(13),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  _StatusBadge(isLive: isLive),
                                  const Spacer(),
                                  AuctionWatchButton(
                                      auctionId: auction['id'] as String,
                                      isGuest: widget.isGuest,
                                      onLogin: widget.onLogin),
                                ],
                              ),
                              const SizedBox(height: 8),
                              Text(
                                '${car['make']} ${car['model']} ${car['year']}',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    color: _darkBlue,
                                    fontSize: 15,
                                    fontWeight: FontWeight.w700),
                              ),
                              const SizedBox(height: 7),
                              Text(
                                _money(auction['currentBidLyd']),
                                style: const TextStyle(
                                    color: _blue,
                                    fontSize: 19,
                                    fontWeight: FontWeight.w800),
                              ),
                              const SizedBox(height: 4),
                              Text('${auction['bidCount']} مزايدة',
                                  style: const TextStyle(
                                      color: _muted, fontSize: 11)),
                              Text(
                                  DateFormat('d MMM · HH:mm', 'ar').format(
                                      DateTime.parse(
                                              auction['startsAt'] as String)
                                          .toLocal()),
                                  style: const TextStyle(
                                      fontSize: 11, color: _muted)),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        );
      },
    );
  }
}

class AuctionDetailsScreen extends StatefulWidget {
  const AuctionDetailsScreen({
    super.key,
    required this.id,
    required this.isGuest,
    this.onLogin,
  });

  final String id;
  final bool isGuest;
  final VoidCallback? onLogin;

  @override
  State<AuctionDetailsScreen> createState() => _AuctionDetailsState();
}

class _AuctionDetailsState extends State<AuctionDetailsScreen> {
  final client = ApiClient();
  Map<String, dynamic>? auction;
  Map<String, dynamic>? participation;
  Map<String, dynamic>? pendingBid;
  Timer? clock;
  Timer? refresh;
  io.Socket? socket;
  String? error;
  bool busy = false;
  int loadRevision = 0;

  @override
  void initState() {
    super.initState();
    unawaited(load());
    unawaited(connectRealtime());
    clock = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
    refresh =
        Timer.periodic(const Duration(seconds: 15), (_) => unawaited(load()));
  }

  @override
  void dispose() {
    clock?.cancel();
    refresh?.cancel();
    socket?.dispose();
    super.dispose();
  }

  Future<void> connectRealtime() async {
    try {
      final token = widget.isGuest
          ? null
          : await const FlutterSecureStorage().read(key: 'access_token');
      if (!mounted) return;
      final endpoint =
          Uri.parse(apiBaseUrl).replace(path: '/auctions').toString();
      socket = io.io(
          endpoint,
          io.OptionBuilder()
              .setTransports(['websocket'])
              .setAuth(token == null ? {} : {'token': token})
              .disableAutoConnect()
              .enableForceNew()
              .build());
      socket!.onConnect((_) {
        socket!.emit('auction:join', {'auctionId': widget.id});
        unawaited(load());
      });
      socket!.on('auction:bid-accepted', (_) => unawaited(load()));
      socket!.on('auction:status-changed', (_) => unawaited(load()));
      socket!.connect();
    } catch (_) {
      // The periodic refresh keeps the auction usable if socket setup fails.
    }
  }

  Future<void> load() async {
    final revision = ++loadRevision;
    try {
      final response = await client.dio
          .get<Map<String, dynamic>>('/v1/auctions/${widget.id}');
      Map<String, dynamic>? mine;
      if (!widget.isGuest) {
        try {
          mine = (await client.dio
                  .get<Map<String, dynamic>>('/v1/auctions/${widget.id}/me'))
              .data;
        } on DioException {
          /* Public auction data remains available during account refresh. */
        }
      }
      if (mounted && revision == loadRevision) {
        setState(() {
          auction = response.data;
          participation = mine;
          error = null;
        });
      }
    } on DioException {
      if (mounted && revision == loadRevision) {
        setState(() => error = 'تعذر الاتصال. سيعاد التحديث تلقائياً.');
      }
    }
  }

  Future<void> bid() async {
    if (widget.isGuest) {
      Navigator.pop(context);
      widget.onLogin?.call();
      return;
    }
    if (participation?['isSeller'] == true) return;
    final data = auction!;
    pendingBid ??= {
      'amountLyd': data['nextBidLyd'].toString(),
      'idempotencyKey': const Uuid().v4(),
    };
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        icon: const Icon(Icons.gavel, color: _blue, size: 30),
        title: const Text('تأكيد المزايدة'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('أنت على وشك تقديم مزايدة ملزمة بقيمة:'),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                  color: _softBlue,
                  border: Border.all(color: _line),
                  borderRadius: BorderRadius.circular(6)),
              child: Text(
                _money(pendingBid!['amountLyd']),
                textAlign: TextAlign.center,
                style: const TextStyle(
                    color: _blue, fontSize: 23, fontWeight: FontWeight.w800),
              ),
            ),
            const SizedBox(height: 12),
            const Text('هذه المزايدة ملزمة وفق شروط المزاد.',
                style: TextStyle(color: _muted, fontSize: 12)),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('إلغاء')),
          FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('تأكيد المزايدة')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await client.dio.post('/v1/auctions/${widget.id}/bids', data: pendingBid);
      pendingBid = null;
      await load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              backgroundColor: _success,
              content: Text('تم قبول المزايدة وحفظها')),
        );
      }
    } on DioException catch (failure) {
      final code = failure.response?.statusCode;
      if (code != null && code < 500) pendingBid = null;
      final reason = failure.response?.data is Map
          ? (failure.response!.data as Map)['message']
          : null;
      if (mounted) {
        setState(() => error = reason == 'auction.wallet_balance_required'
            ? 'رصيد محفظتك أقل من حد أهلية المزايدة.'
            : code == 403
                ? 'يتطلب المزاد حساباً نشطاً ورقم هاتف موثقاً.'
                : 'تعذر تأكيد المزايدة. راجع السعر وحاول مجدداً.');
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> cancelNoWinner() async {
    final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
              title: const Text('إلغاء المزاد بدون فائز'),
              content: const Text('سيبقى سجل المزايدات محفوظًا بعد الإلغاء.'),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(context, false),
                    child: const Text('رجوع')),
                FilledButton(
                    onPressed: () => Navigator.pop(context, true),
                    child: const Text('إلغاء المزاد'))
              ],
            ));
    if (confirmed != true || !mounted) return;
    setState(() => busy = true);
    try {
      await client.dio.post('/v1/auctions/${widget.id}/cancel');
      await load();
    } on DioException {
      if (mounted) {
        setState(
            () => error = 'تعذر إلغاء المزاد. تحقق من النتيجة وحاول مجددًا.');
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final data = auction;
    if (data == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('المزاد')),
        body: Center(
            child: error == null
                ? const CircularProgressIndicator()
                : Text(error!)),
      );
    }
    final car = data['vehicle'] as Map<String, dynamic>;
    final costs = data['costs'] as Map<String, dynamic>;
    final remaining =
        DateTime.parse(data['endsAt'] as String).difference(DateTime.now());
    final seconds = remaining.isNegative ? 0 : remaining.inSeconds;
    final timer = _clockText(seconds);
    final image = car['imageUrl'] as String?;
    final live = data['status'] == 'Live' && seconds > 0;
    final isSeller = participation?['isSeller'] == true;
    final canCancel = participation?['canCancel'] == true;
    final walletEligible = participation?['walletEligible'] != false;
    final roundSeconds = (data['roundSeconds'] as num?)?.toInt() ?? 120;

    return Scaffold(
      appBar: AppBar(title: Text('${car['make']} ${car['model']}'), actions: [
        FavoriteButton(
            vehicleId: car['id'] as String,
            isGuest: widget.isGuest,
            onLogin: widget.onLogin),
        AuctionWatchButton(
            auctionId: widget.id,
            isGuest: widget.isGuest,
            onLogin: widget.onLogin),
      ]),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 110),
        children: [
          AspectRatio(
            aspectRatio: 16 / 10,
            child: ColoredBox(
              color: const Color(0xFFEAF0F8),
              child: image != null
                  ? Image.network(
                      resolveApiUrl(image),
                      fit: BoxFit.contain,
                      errorBuilder: (_, __, ___) => const Icon(
                          Icons.image_not_supported_outlined,
                          size: 52),
                    )
                  : const Center(
                      child:
                          Icon(Icons.directions_car, color: _blue, size: 70)),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  '${car['year']} · ${car['city'] ?? 'مدينة غير محددة'} · ${car['lotNumber']}',
                  style: const TextStyle(color: _muted, fontSize: 12),
                ),
                if ((data['description'] as String?)?.isNotEmpty == true) ...[
                  const SizedBox(height: 12),
                  Text(data['description'] as String,
                      style: const TextStyle(color: _darkBlue, height: 1.5)),
                ],
                const SizedBox(height: 14),
                _AuctionStatusStrip(
                  live: live,
                  currentBid: _money(data['currentBidLyd']),
                  nextBid: _money(data['nextBidLyd']),
                  timer: timer,
                  seconds: seconds,
                  roundSeconds: roundSeconds,
                  rollingRound: data['rollingRound'] == true,
                  isLeading: participation?['isLeading'] == true,
                  isOutbid: participation?['isOutbid'] == true,
                ),
                const SizedBox(height: 12),
                ExpansionTile(
                  tilePadding: EdgeInsets.zero,
                  title: const Text('تفاصيل إضافية عن المزاد'),
                  children: [
                    _CostRow(
                        label: 'بداية المزاد',
                        value: DateTime.parse(data['startsAt'] as String)
                            .toLocal()
                            .toString()
                            .substring(0, 16)),
                    _CostRow(
                        label: 'الزيادة الدنيا',
                        value: _money(data['bidIncrementLyd'])),
                    _CostRow(label: 'رقم العرض', value: '${car['lotNumber']}'),
                    if (car['mileageKm'] != null)
                      _CostRow(
                          label: 'المسافة', value: '${car['mileageKm']} كم'),
                  ],
                ),
                const SizedBox(height: 22),
                const Text('التكلفة عند الفوز',
                    style: TextStyle(
                        color: _darkBlue,
                        fontSize: 18,
                        fontWeight: FontWeight.w800)),
                const SizedBox(height: 10),
                _CostRow(
                    label: 'السعر الحالي',
                    value: _money(data['currentBidLyd'])),
                _CostRow(
                    label: 'رسوم الشراء', value: _money(costs['buyerFeeLyd'])),
                _CostRow(
                    label: 'إجمالي الشراء',
                    value: _money(costs['totalLyd']),
                    highlighted: true),
                _CostRow(
                    label: 'العربون والرسوم بعد الفوز',
                    value: _money(costs['dueNowLyd'])),
                _CostRow(
                    label: 'المبلغ المتبقي',
                    value: _money(costs['remainingLyd'])),
                Padding(
                  padding: const EdgeInsets.only(top: 9),
                  child: Text(
                    'مهلة دفع العربون: ${costs['paymentDeadlineMinutes']} دقيقة من تأكيد الفوز.',
                    style: const TextStyle(color: _muted, fontSize: 11),
                  ),
                ),
                if (!widget.isGuest && participation != null) ...[
                  const SizedBox(height: 18),
                  const Text('أهلية المحفظة',
                      style: TextStyle(
                          color: _darkBlue,
                          fontSize: 16,
                          fontWeight: FontWeight.w800)),
                  _CostRow(
                      label: 'رصيدك',
                      value: _money(participation!['balanceLyd'])),
                  _CostRow(
                      label: 'الرصيد المطلوب للمزايدة',
                      value: _money(participation!['requiredBalanceLyd'])),
                  const Text('شرط أهلية فقط، لا يُخصم عند تقديم المزايدة.',
                      style: TextStyle(color: _muted, fontSize: 11)),
                  const Text(
                      'يمكن طلب استرداد التأمين بعد نهاية المزاد وتسوية الالتزامات. العربون ورسوم الشراء منفصلان.',
                      style: TextStyle(color: _muted, fontSize: 11)),
                  OutlinedButton.icon(
                      onPressed: () => Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                      builder: (_) => const WalletScreen()))
                              .then((_) {
                            if (mounted) load();
                          }),
                      icon: const Icon(Icons.account_balance_wallet_outlined),
                      label: Text(
                          walletEligible ? 'المحفظة' : 'شحن الرصيد المطلوب')),
                  OutlinedButton.icon(
                      onPressed: () => requestVehicleService(context,
                          vehicleId: car['id'] as String, inspection: true),
                      icon: const Icon(Icons.fact_check_outlined),
                      label: const Text('طلب فحص')),
                  if (!walletEligible)
                    const Text(
                        'رصيد المحفظة أقل من المطلوب. راجع حسابك قبل المزايدة.',
                        style: TextStyle(
                            color: _danger,
                            fontSize: 12,
                            fontWeight: FontWeight.w700)),
                ],
                if (error != null)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: Text(error!,
                        style: const TextStyle(
                            color: _danger, fontWeight: FontWeight.w700)),
                  ),
                const SizedBox(height: 24),
                const Text('آخر المزايدات',
                    style: TextStyle(
                        color: _darkBlue,
                        fontWeight: FontWeight.w800,
                        fontSize: 18)),
                const SizedBox(height: 8),
                ...(data['recentBids'] as List<dynamic>).map(
                  (item) => ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const CircleAvatar(
                      radius: 18,
                      backgroundColor: _softBlue,
                      foregroundColor: _blue,
                      child: Icon(Icons.person_outline, size: 18),
                    ),
                    title: Text('${item['bidder']}'),
                    trailing: Text(
                      _money(item['amountLyd']),
                      style: const TextStyle(
                          color: _darkBlue, fontWeight: FontWeight.w800),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(14, 8, 14, 12),
        child: SizedBox(
          height: 58,
          child: FilledButton.icon(
            onPressed: busy
                ? null
                : isSeller
                    ? (canCancel ? cancelNoWinner : null)
                    : (!live || !walletEligible ? null : bid),
            icon: Icon(isSeller ? Icons.cancel_outlined : Icons.gavel),
            label: Text(
              isSeller
                  ? canCancel
                      ? 'إلغاء المزاد بدون فائز'
                      : 'مزاد سيارتك · ${data['bidCount']} مزايدة'
                  : widget.isGuest
                      ? 'سجل الدخول للمزايدة'
                      : 'زايد الآن · ${_money(data['nextBidLyd'])}',
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
        ),
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.isLive});
  final bool isLive;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: isLive ? const Color(0xFFFFEEEE) : _softBlue,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
              width: 7,
              height: 7,
              decoration: BoxDecoration(
                  color: isLive ? _danger : _blue, shape: BoxShape.circle)),
          const SizedBox(width: 6),
          Text(isLive ? 'مباشر' : 'قادم',
              style: TextStyle(
                  color: isLive ? _danger : _blue,
                  fontSize: 10,
                  fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}

class _AuctionStatusStrip extends StatelessWidget {
  const _AuctionStatusStrip({
    required this.live,
    required this.currentBid,
    required this.nextBid,
    required this.timer,
    required this.seconds,
    required this.roundSeconds,
    required this.rollingRound,
    required this.isLeading,
    required this.isOutbid,
  });

  final bool live;
  final String currentBid;
  final String nextBid;
  final String timer;
  final int seconds;
  final int roundSeconds;
  final bool rollingRound;
  final bool isLeading;
  final bool isOutbid;

  @override
  Widget build(BuildContext context) {
    final ringColor = isLeading
        ? _success
        : isOutbid
            ? _danger
            : _blue;
    final progress = (seconds / roundSeconds).clamp(0.0, 1.0);
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: const Color(0xFFBFD0E6)),
        borderRadius: BorderRadius.circular(8),
        boxShadow: const [
          BoxShadow(
              color: Color(0x1217375E), blurRadius: 20, offset: Offset(0, 8))
        ],
      ),
      child: Column(
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 9),
            decoration: const BoxDecoration(
              color: Color(0xFFFFF4F4),
              borderRadius: BorderRadius.vertical(top: Radius.circular(7)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                        color: live ? _danger : _muted,
                        shape: BoxShape.circle)),
                const SizedBox(width: 7),
                Text(live ? 'LIVE · مزاد مباشر' : 'المزاد غير مباشر',
                    style: TextStyle(
                        color: live ? _danger : _muted,
                        fontWeight: FontWeight.w800)),
              ],
            ),
          ),
          Row(
            children: [
              Expanded(
                  child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 320),
                transitionBuilder: (child, animation) =>
                    FadeTransition(opacity: animation, child: child),
                child: _StripMetric(
                  key: ValueKey(currentBid),
                  label: 'السعر الحالي',
                  value: currentBid,
                  prominent: true,
                ),
              )),
              const SizedBox(
                  height: 76, child: VerticalDivider(width: 1, color: _line)),
              Expanded(
                  child:
                      _StripMetric(label: 'المزايدة التالية', value: nextBid)),
            ],
          ),
          const Divider(height: 1, color: _line),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Column(
              children: [
                SizedBox(
                  width: 150,
                  height: 150,
                  child: Stack(alignment: Alignment.center, children: [
                    SizedBox(
                        width: 150,
                        height: 150,
                        child: TweenAnimationBuilder<double>(
                          tween: Tween<double>(end: progress),
                          duration: const Duration(milliseconds: 450),
                          builder: (context, value, child) =>
                              CircularProgressIndicator(
                                  value: value,
                                  strokeWidth: 10,
                                  strokeCap: StrokeCap.round,
                                  backgroundColor: const Color(0xFFE3EAF3),
                                  valueColor:
                                      AlwaysStoppedAnimation<Color>(ringColor)),
                        )),
                    Column(mainAxisSize: MainAxisSize.min, children: [
                      Directionality(
                          textDirection: TextDirection.ltr,
                          child: Text(timer,
                              style: TextStyle(
                                  color: ringColor,
                                  fontSize: 24,
                                  fontWeight: FontWeight.w800))),
                      Text(
                          isLeading
                              ? 'مزايدتك هي الأعلى'
                              : isOutbid
                                  ? 'تم تجاوز مزايدتك'
                                  : rollingRound
                                      ? 'جولة سريعة'
                                      : 'مزاد مباشر',
                          style: const TextStyle(color: _muted, fontSize: 10)),
                    ]),
                  ]),
                ),
                const SizedBox(height: 8),
                Text(
                    'الوقت المتبقي${rollingRound ? ' · يتجدد بعد كل مزايدة' : ''}',
                    style: const TextStyle(color: _muted, fontSize: 10)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _StripMetric extends StatelessWidget {
  const _StripMetric(
      {super.key,
      required this.label,
      required this.value,
      this.prominent = false});
  final String label;
  final String value;
  final bool prominent;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minHeight: 76),
      color: prominent ? _softBlue : Colors.white,
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(label, style: const TextStyle(color: _muted, fontSize: 10)),
          const SizedBox(height: 6),
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
              value,
              maxLines: 1,
              style: TextStyle(
                  color: prominent ? _blue : _darkBlue,
                  fontSize: prominent ? 20 : 17,
                  fontWeight: FontWeight.w800),
            ),
          ),
        ],
      ),
    );
  }
}

class _CostRow extends StatelessWidget {
  const _CostRow(
      {required this.label, required this.value, this.highlighted = false});
  final String label;
  final String value;
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 13),
      decoration: BoxDecoration(
        color: highlighted ? _softBlue : Colors.transparent,
        border: const Border(bottom: BorderSide(color: _line)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                  color: highlighted ? _darkBlue : _muted,
                  fontSize: 12,
                  fontWeight: highlighted ? FontWeight.w700 : FontWeight.w400),
            ),
          ),
          Text(value,
              style: TextStyle(
                  color: highlighted ? _blue : _darkBlue,
                  fontWeight: FontWeight.w800,
                  fontSize: highlighted ? 15 : 13)),
        ],
      ),
    );
  }
}

String _clockText(int totalSeconds) {
  final hours = totalSeconds ~/ 3600;
  final minutes = totalSeconds % 3600 ~/ 60;
  final seconds = totalSeconds % 60;
  return '${hours.toString().padLeft(2, '0')}:${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
}
