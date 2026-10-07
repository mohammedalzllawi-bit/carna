import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';

final techniciansProvider =
    FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final response = await ApiClient().dio.get<List<dynamic>>('/v1/technicians');
  return (response.data ?? []).cast<Map<String, dynamic>>();
});

final technicianDetailProvider =
    FutureProvider.family<Map<String, dynamic>, String>((ref, id) async {
  final response =
      await ApiClient().dio.get<Map<String, dynamic>>('/v1/technicians/$id');
  return response.data!;
});

class TechniciansScreen extends ConsumerWidget {
  const TechniciansScreen({super.key, this.isGuest = false, this.onLogin});

  final bool isGuest;
  final VoidCallback? onLogin;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final technicians = ref.watch(techniciansProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('الفنيون المعتمدون')),
      body: technicians.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => Center(
          child: FilledButton.icon(
            onPressed: () => ref.invalidate(techniciansProvider),
            icon: const Icon(Icons.refresh),
            label: const Text('إعادة المحاولة'),
          ),
        ),
        data: (items) => items.isEmpty
            ? const Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.build_outlined, size: 42),
                    SizedBox(height: 10),
                    Text('لا يوجد فنيون منشورون حالياً'),
                  ],
                ),
              )
            : ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: items.length,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (context, index) {
                  final item = items[index];
                  final city = item['city'] as Map<String, dynamic>?;
                  final price = item['basePriceLyd'] as num;
                  return Card(
                    child: ListTile(
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => TechnicianDetailScreen(
                            id: item['id'] as String,
                            isGuest: isGuest,
                            onLogin: onLogin,
                          ),
                        ),
                      ),
                      contentPadding: const EdgeInsets.all(14),
                      leading: const CircleAvatar(
                        child: Icon(Icons.build_outlined),
                      ),
                      title: Text(
                        item['name'] as String,
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      subtitle: Padding(
                        padding: const EdgeInsets.only(top: 5),
                        child: Text(
                          '${item['specialty']} · ${city?['nameAr'] ?? 'غير محددة'} · ${item['ratingAverage'] ?? 0}/5',
                        ),
                      ),
                      trailing: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            '${price.toStringAsFixed(price % 1 == 0 ? 0 : 3)} د.ل',
                            style: const TextStyle(
                              color: Color(0xFF1769D2),
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const Icon(Icons.chevron_left, size: 18),
                        ],
                      ),
                    ),
                  );
                },
              ),
      ),
    );
  }
}

class TechnicianDetailScreen extends ConsumerStatefulWidget {
  const TechnicianDetailScreen({
    super.key,
    required this.id,
    required this.isGuest,
    this.onLogin,
  });

  final String id;
  final bool isGuest;
  final VoidCallback? onLogin;

  @override
  ConsumerState<TechnicianDetailScreen> createState() =>
      _TechnicianDetailScreenState();
}

class _TechnicianDetailScreenState
    extends ConsumerState<TechnicianDetailScreen> {
  final comment = TextEditingController();
  int rating = 5;
  bool saving = false;
  String? notice;
  String? error;

  @override
  void dispose() {
    comment.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(technicianDetailProvider(widget.id));
    return Scaffold(
      appBar: AppBar(title: const Text('تفاصيل الفني')),
      body: detail.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => Center(
          child: FilledButton.icon(
            onPressed: () =>
                ref.invalidate(technicianDetailProvider(widget.id)),
            icon: const Icon(Icons.refresh),
            label: const Text('إعادة المحاولة'),
          ),
        ),
        data: (item) {
          final city = item['city'] as Map<String, dynamic>?;
          final services = (item['services'] as List<dynamic>? ?? [])
              .cast<Map<String, dynamic>>();
          final reviews = (item['reviews'] as List<dynamic>? ?? [])
              .cast<Map<String, dynamic>>();
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(18),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const CircleAvatar(
                            radius: 27,
                            child: Icon(Icons.build_outlined),
                          ),
                          const SizedBox(width: 13),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  item['name'] as String,
                                  style: const TextStyle(
                                    fontSize: 20,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  '${item['specialty']} · ${city?['nameAr'] ?? 'غير محددة'}',
                                ),
                              ],
                            ),
                          ),
                          const Icon(Icons.verified, color: Color(0xFF1769D2)),
                        ],
                      ),
                      const Divider(height: 28),
                      Wrap(
                        spacing: 18,
                        runSpacing: 10,
                        children: [
                          Text('التقييم ${item['ratingAverage'] ?? 0}/5'),
                          Text('${item['ratingCount'] ?? 0} تقييم'),
                          Text(
                              '${item['completedInspections'] ?? 0} فحص مكتمل'),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 14),
              const Text(
                'الخدمات والأسعار',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 8),
              ...services.map(
                (service) => Card(
                  child: ListTile(
                    title: Text(service['name'] as String),
                    subtitle: service['durationMinutes'] == null
                        ? null
                        : Text('${service['durationMinutes']} دقيقة'),
                    trailing: Text(
                      '${service['priceLyd']} د.ل',
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 18),
              const Text(
                'تقييمات العملاء',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 8),
              if (reviews.isEmpty)
                const Text(
                  'لا توجد تقييمات بعد.',
                  style: TextStyle(color: Color(0xFF65758B)),
                ),
              ...reviews.map(
                (review) => Card(
                  child: ListTile(
                    title: Text(
                      '${review['reviewerName']} · ${review['rating']}/5',
                    ),
                    subtitle: Text(
                      (review['comment'] as String?) ?? 'تقييم دون تعليق',
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 18),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: widget.isGuest ? _guestPrompt() : _reviewForm(),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _guestPrompt() => Column(
        children: [
          const Text('سجل الدخول لتقييم الفني بعد اكتمال الفحص.'),
          const SizedBox(height: 10),
          FilledButton.icon(
            onPressed: widget.onLogin,
            icon: const Icon(Icons.login),
            label: const Text('تسجيل الدخول'),
          ),
        ],
      );

  Widget _reviewForm() => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'قيّم الفني بعد اكتمال الفحص',
            style: TextStyle(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<int>(
            initialValue: rating,
            decoration: const InputDecoration(
              labelText: 'التقييم',
              border: OutlineInputBorder(),
            ),
            items: [5, 4, 3, 2, 1]
                .map((value) => DropdownMenuItem(
                      value: value,
                      child: Text('$value من 5'),
                    ))
                .toList(),
            onChanged: (value) => rating = value ?? 5,
          ),
          const SizedBox(height: 10),
          TextField(
            controller: comment,
            maxLength: 1000,
            maxLines: 4,
            decoration: const InputDecoration(
              labelText: 'التعليق',
              border: OutlineInputBorder(),
            ),
          ),
          if (notice != null)
            Text(notice!, style: const TextStyle(color: Color(0xFF28734E))),
          if (error != null)
            Text(error!, style: const TextStyle(color: Colors.red)),
          const SizedBox(height: 8),
          FilledButton.icon(
            onPressed: saving ? null : _submit,
            icon: saving
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.star_outline),
            label: const Text('حفظ التقييم'),
          ),
        ],
      );

  Future<void> _submit() async {
    setState(() {
      saving = true;
      error = null;
      notice = null;
    });
    try {
      await ApiClient().dio.post(
        '/v1/technicians/${widget.id}/reviews',
        data: {'rating': rating, 'comment': comment.text.trim()},
      );
      comment.clear();
      ref.invalidate(technicianDetailProvider(widget.id));
      setState(() => notice = 'تم حفظ تقييمك.');
    } on DioException catch (exception) {
      final data = exception.response?.data;
      final message = data is Map<String, dynamic> ? data['message'] : null;
      setState(() => error = message == 'review.completed_inspection_required'
          ? 'يمكنك التقييم بعد اكتمال خدمة فحص مع هذا الفني.'
          : 'تعذر حفظ التقييم.');
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }
}
