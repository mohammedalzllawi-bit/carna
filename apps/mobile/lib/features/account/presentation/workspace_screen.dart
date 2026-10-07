import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:uuid/uuid.dart';
import '../../../core/api/api_client.dart';
import 'wallet_screen.dart';

class WorkspaceScreen extends StatefulWidget {
  const WorkspaceScreen({super.key, this.technician = false, this.client});
  final ApiClient? client;
  final bool technician;
  @override
  State<WorkspaceScreen> createState() => _WorkspaceScreenState();
}

class _WorkspaceScreenState extends State<WorkspaceScreen> {
  late final api = widget.client ?? ApiClient();
  Map<String, dynamic>? data;
  String? error;
  bool busy = false, incoming = true, fetching = false;
  Timer? timer;
  @override
  void initState() {
    super.initState();
    load();
    timer = Timer.periodic(const Duration(seconds: 10), (_) => load());
  }

  @override
  void dispose() {
    timer?.cancel();
    if (widget.client == null) api.dio.close();
    super.dispose();
  }

  Future<void> load() async {
    if (fetching || busy) return;
    fetching = true;
    try {
      final r =
          await api.dio.get<Map<String, dynamic>>('/v1/workspace/requests');
      if (mounted) setState(() => data = r.data);
    } catch (e) {
      if (mounted) setState(() => error = accountError(e));
    } finally {
      fetching = false;
    }
  }

  Future<void> action(
      String kind, Map<dynamic, dynamic> item, String action) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await api.dio
          .patch('/v1/workspace/$kind/${item['id']}', data: {'action': action});
    } catch (e) {
      if (mounted) setState(() => error = accountError(e));
    } finally {
      if (mounted) {
        setState(() => busy = false);
        await load();
      }
    }
  }

  Future<void> report(Map<dynamic, dynamic> item) async {
    final keys = {
      'technicianNotes': 'نتائج الفحص والعيوب',
      'recommendations': 'التوصيات',
      'engine': 'المحرك',
      'transmission': 'ناقل الحركة',
      'electric': 'الكهرباء',
      'chassis': 'الشاصي',
      'overallScore': 'التقييم من 100'
    };
    final controllers = {for (final k in keys.keys) k: TextEditingController()};
    final form = GlobalKey<FormState>();
    final yes = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
                title: const Text('تقرير الفحص'),
                content: SizedBox(
                    width: 440,
                    child: Form(
                        key: form,
                        child: SingleChildScrollView(
                            child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                              for (final entry in keys.entries)
                                TextFormField(
                                    controller: controllers[entry.key],
                                    maxLines:
                                        entry.key == 'technicianNotes' ? 3 : 1,
                                    keyboardType: entry.key == 'overallScore'
                                        ? TextInputType.number
                                        : TextInputType.text,
                                    decoration:
                                        InputDecoration(labelText: entry.value),
                                    validator: (v) => entry.key ==
                                            'overallScore'
                                        ? ((int.tryParse(v ?? '') ?? -1) < 0 ||
                                                (int.tryParse(v ?? '') ?? 101) >
                                                    100
                                            ? 'أدخل قيمة من 0 إلى 100'
                                            : null)
                                        : (v?.trim().length ?? 0) <
                                                (entry.key == 'technicianNotes'
                                                    ? 10
                                                    : 2)
                                            ? 'أكمل هذه الخانة'
                                            : null),
                            ])))),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: const Text('إلغاء')),
                  FilledButton(
                      onPressed: () {
                        if (form.currentState!.validate()) {
                          Navigator.pop(context, true);
                        }
                      },
                      child: const Text('إرسال التقرير'))
                ]));
    final payload = <String, dynamic>{
      for (final k in keys.keys)
        k: k == 'overallScore'
            ? int.tryParse(controllers[k]!.text)
            : controllers[k]!.text.trim()
    };
    for (final c in controllers.values) {
      c.dispose();
    }
    if (yes != true || !mounted) return;
    setState(() => busy = true);
    try {
      await api.dio.post('/v1/workspace/inspections/${item['id']}/report',
          data: payload);
    } catch (e) {
      if (mounted) setState(() => error = accountError(e));
    } finally {
      if (mounted) {
        setState(() => busy = false);
        await load();
      }
    }
  }

  Future<void> review(Map<dynamic, dynamic> item, bool inspection) async {
    final id = inspection
        ? (item['technician']?['id'])
        : (item['vehicle']?['dealerId']);
    if (id == null) return;
    int rating = 5;
    final comment = TextEditingController();
    final yes = await showDialog<bool>(
        context: context,
        builder: (context) => StatefulBuilder(
            builder: (context, update) => AlertDialog(
                    title: Text(inspection ? 'تقييم الفني' : 'تقييم المعرض'),
                    content: Column(mainAxisSize: MainAxisSize.min, children: [
                      Wrap(children: [
                        for (int n = 1; n <= 5; n++)
                          IconButton(
                              tooltip: '$n من 5',
                              onPressed: () => update(() => rating = n),
                              icon: Icon(
                                  n <= rating ? Icons.star : Icons.star_border,
                                  color: Colors.amber.shade700))
                      ]),
                      TextField(
                          controller: comment,
                          maxLength: 1000,
                          decoration:
                              const InputDecoration(labelText: 'تعليقك')),
                    ]),
                    actions: [
                      TextButton(
                          onPressed: () => Navigator.pop(context, false),
                          child: const Text('إلغاء')),
                      FilledButton(
                          onPressed: () => Navigator.pop(context, true),
                          child: const Text('نشر التقييم'))
                    ])));
    final text = comment.text.trim();
    comment.dispose();
    if (yes != true || !mounted) return;
    try {
      await api.dio.post(
          '/v1/${inspection ? 'technicians' : 'dealers'}/$id/reviews',
          data: {'rating': rating, 'comment': text});
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('تم حفظ تقييمك')));
      }
    } catch (e) {
      if (mounted) setState(() => error = accountError(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final sales = (data?['sales'] as List<dynamic>? ?? [])
        .where((r) => r['incoming'] == incoming)
        .toList();
    final inspections = (data?['inspections'] as List<dynamic>? ?? [])
        .where((r) => r['incoming'] == incoming)
        .toList();
    return Scaffold(
        appBar:
            AppBar(title: Text(widget.technician ? 'واجهة الفني' : 'طلباتي')),
        body: data == null && error == null
            ? const Center(child: CircularProgressIndicator())
            : RefreshIndicator(
                onRefresh: load,
                child: ListView(padding: const EdgeInsets.all(16), children: [
                  if (data?['technician'] != null)
                    SwitchListTile(
                        secondary: const Icon(Icons.verified_outlined),
                        value: data!['technician']['availabilityStatus'] ==
                            'available',
                        onChanged: busy
                            ? null
                            : (value) async {
                                setState(() => busy = true);
                                try {
                                  await api.dio.patch(
                                      '/v1/workspace/technician/availability',
                                      data: {
                                        'status':
                                            value ? 'available' : 'unavailable'
                                      });
                                } catch (e) {
                                  if (mounted) {
                                    setState(() => error = accountError(e));
                                  }
                                } finally {
                                  if (mounted) {
                                    setState(() => busy = false);
                                    await load();
                                  }
                                }
                              },
                        title: Text('${data!['technician']['name']}'),
                        subtitle: Text(data!['technician']
                                    ['availabilityStatus'] ==
                                'available'
                            ? 'متاح للعمل'
                            : 'غير متاح حالياً')),
                  SegmentedButton<bool>(
                      segments: const [
                        ButtonSegment(
                            value: true,
                            label: Text('واردة'),
                            icon: Icon(Icons.call_received)),
                        ButtonSegment(
                            value: false,
                            label: Text('مرسلة'),
                            icon: Icon(Icons.call_made))
                      ],
                      selected: {
                        incoming
                      },
                      onSelectionChanged: (v) =>
                          setState(() => incoming = v.first)),
                  if (error != null)
                    Padding(
                        padding: const EdgeInsets.all(12),
                        child: Text(error!,
                            style: const TextStyle(color: Colors.red))),
                  if (busy) const LinearProgressIndicator(),
                  if (sales.isEmpty && inspections.isEmpty)
                    const Padding(
                        padding: EdgeInsets.all(40),
                        child: Center(child: Text('لا توجد طلبات هنا'))),
                  if (sales.isNotEmpty)
                    const Padding(
                        padding: EdgeInsets.symmetric(vertical: 18),
                        child: Text('طلبات الشراء',
                            style: TextStyle(
                                fontSize: 18, fontWeight: FontWeight.w700))),
                  for (final r in sales) _item(r, false),
                  if (inspections.isNotEmpty)
                    const Padding(
                        padding: EdgeInsets.symmetric(vertical: 18),
                        child: Text('طلبات الفحص',
                            style: TextStyle(
                                fontSize: 18, fontWeight: FontWeight.w700))),
                  for (final r in inspections) _item(r, true),
                ])));
  }

  Widget _item(Map<dynamic, dynamic> r, bool inspection) {
    final status = r['status'];
    final kind = inspection ? 'inspections' : 'sales';
    Widget command(String action, String label, IconData icon) =>
        OutlinedButton.icon(
            onPressed: busy ? null : () => this.action(kind, r, action),
            icon: Icon(icon, size: 17),
            label: Text(label));
    return Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Card(
            child: Padding(
                padding: const EdgeInsets.all(15),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                          '${r['vehicle']?['make'] ?? ''} ${r['vehicle']?['model'] ?? ''} ${r['vehicle']?['year'] ?? ''}',
                          style: const TextStyle(
                              fontSize: 16, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 8),
                      Text(accountStatus(status),
                          style: TextStyle(
                              color: status == 'Completed'
                                  ? Colors.green
                                  : Theme.of(context).colorScheme.primary)),
                      if (inspection) ...[
                        Text(
                            '${r['technician']?['name']} · ${accountMoney(r['priceLyd'])}'),
                        if (r['scheduledAt'] != null)
                          Text(DateFormat('d MMM y · HH:mm', 'ar').format(
                              DateTime.parse(r['scheduledAt'] as String)
                                  .toLocal()))
                      ],
                      if (r['message'] != null || r['notes'] != null)
                        Text('${r['message'] ?? r['notes']}'),
                      if (r['report'] != null)
                        ExpansionTile(
                            tilePadding: EdgeInsets.zero,
                            title: Text(
                                'تقرير الفحص · ${r['report']['overallScore']}/100'),
                            children: [
                              Text('${r['report']['technicianNotes']}'),
                              Text('${r['report']['recommendations']}'),
                              for (final key in [
                                'engineCheck',
                                'transmissionCheck',
                                'electricCheck',
                                'chassisCheck'
                              ])
                                if (r['report'][key] != null)
                                  Text('${r['report'][key]['notes']}'),
                            ]),
                      const SizedBox(height: 10),
                      Wrap(spacing: 8, runSpacing: 6, children: [
                        if (incoming &&
                            status == (inspection ? 'Paid' : 'Pending'))
                          command('accept', 'قبول', Icons.check),
                        if (incoming &&
                            ['Pending', 'Paid', 'PaymentPending']
                                .contains(status))
                          command('reject', 'رفض', Icons.close),
                        if (incoming &&
                            status == (inspection ? 'Scheduled' : 'Accepted'))
                          command(
                              inspection ? 'start' : 'deliver',
                              inspection ? 'بدء الفحص' : 'تأكيد التسليم',
                              Icons.play_arrow),
                        if (incoming && inspection && status == 'InProgress')
                          OutlinedButton.icon(
                              onPressed: busy ? null : () => report(r),
                              icon: const Icon(Icons.assignment_outlined),
                              label: const Text('تقرير الفحص')),
                        if (!incoming &&
                            [
                              'Pending',
                              'Accepted',
                              'PaymentPending',
                              'Paid',
                              'Scheduled'
                            ].contains(status))
                          command('cancel', 'إلغاء الطلب', Icons.close),
                        if (!incoming &&
                            ['Delivered', 'ReportSubmitted'].contains(status))
                          command('complete', 'تأكيد اكتمال الخدمة',
                              Icons.done_all),
                        if (!incoming && status == 'PaymentPending')
                          OutlinedButton.icon(
                              onPressed: () => Navigator.push(
                                      context,
                                      MaterialPageRoute(
                                          builder: (_) => const WalletScreen()))
                                  .then((_) => load()),
                              icon: const Icon(Icons.account_balance_wallet),
                              label: const Text('إكمال الدفع')),
                        if (!incoming &&
                            status == 'Completed' &&
                            (inspection || r['vehicle']?['dealerId'] != null))
                          OutlinedButton.icon(
                              onPressed: () => review(r, inspection),
                              icon: const Icon(Icons.star_outline),
                              label: const Text('تقييم الخدمة')),
                      ]),
                    ]))));
  }
}

Future<void> requestVehicleService(BuildContext context,
    {required String vehicleId, required bool inspection}) async {
  final api = ApiClient();
  final note = TextEditingController();
  try {
    List<dynamic> technicians = [];
    if (inspection) {
      technicians =
          (await api.dio.get<List<dynamic>>('/v1/technicians')).data ?? [];
    }
    if (!context.mounted) return;
    if (inspection && technicians.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('لا يوجد فنيون متاحون حالياً')));
      return;
    }
    String? technicianId =
        inspection ? technicians.first['id'] as String : null;
    DateTime appointment = DateTime.now().add(const Duration(days: 1));
    final yes = await showDialog<bool>(
        context: context,
        builder: (context) => StatefulBuilder(
            builder: (context, update) => AlertDialog(
                    title: Text(
                        inspection ? 'طلب فحص المركبة' : 'طلب شراء المركبة'),
                    content: SingleChildScrollView(
                        child:
                            Column(mainAxisSize: MainAxisSize.min, children: [
                      if (inspection) ...[
                        DropdownButtonFormField<String>(
                            initialValue: technicianId,
                            isExpanded: true,
                            decoration: const InputDecoration(
                                labelText: 'الفني والسعر'),
                            items: [
                              for (final t in technicians)
                                DropdownMenuItem(
                                    value: t['id'] as String,
                                    child: Text(
                                        '${t['name']} · ${accountMoney(t['basePriceLyd'])}',
                                        overflow: TextOverflow.ellipsis))
                            ],
                            onChanged: (v) => update(() => technicianId = v)),
                        ListTile(
                            contentPadding: EdgeInsets.zero,
                            leading: const Icon(Icons.schedule),
                            title: Text(DateFormat('d MMM y · HH:mm', 'ar')
                                .format(appointment)),
                            onTap: () async {
                              final day = await showDatePicker(
                                  context: context,
                                  initialDate: appointment,
                                  firstDate: DateTime.now(),
                                  lastDate: DateTime.now()
                                      .add(const Duration(days: 89)));
                              if (day == null || !context.mounted) return;
                              final time = await showTimePicker(
                                  context: context,
                                  initialTime:
                                      TimeOfDay.fromDateTime(appointment));
                              if (time != null) {
                                update(() => appointment = DateTime(
                                    day.year,
                                    day.month,
                                    day.day,
                                    time.hour,
                                    time.minute));
                              }
                            }),
                      ],
                      TextField(
                          controller: note,
                          maxLength: 1000,
                          decoration: const InputDecoration(
                              labelText: 'ملاحظات (اختياري)')),
                    ])),
                    actions: [
                      TextButton(
                          onPressed: () => Navigator.pop(context, false),
                          child: const Text('إلغاء')),
                      FilledButton(
                          onPressed: () => Navigator.pop(context, true),
                          child: const Text('إرسال الطلب'))
                    ])));
    if (yes != true) return;
    await api.dio
        .post('/v1/workspace/${inspection ? 'inspections' : 'sales'}', data: {
      'vehicleId': vehicleId,
      if (inspection) ...{
        'technicianId': technicianId,
        'scheduledAt': appointment.toUtc().toIso8601String(),
        'idempotencyKey': const Uuid().v4(),
        'notes': note.text.trim()
      } else
        'message': note.text.trim()
    });
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(inspection
              ? 'تم إنشاء الطلب. أكمل دفع قيمة الفحص من المحفظة.'
              : 'تم إرسال طلب الشراء إلى البائع')));
    }
  } catch (e) {
    if (context.mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(accountError(e))));
    }
  } finally {
    note.dispose();
    api.dio.close();
  }
}
