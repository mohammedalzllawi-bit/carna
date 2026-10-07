import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';

final dealersProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final response = await ApiClient().dio.get<List<dynamic>>('/v1/dealers');
  return (response.data ?? []).cast<Map<String, dynamic>>();
});

final dealerDetailProvider =
    FutureProvider.family<Map<String, dynamic>, String>((ref, id) async {
  final response =
      await ApiClient().dio.get<Map<String, dynamic>>('/v1/dealers/$id');
  return response.data!;
});

class DealersScreen extends ConsumerWidget {
  const DealersScreen({super.key, required this.isGuest, this.onLogin});

  final bool isGuest;
  final VoidCallback? onLogin;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dealers = ref.watch(dealersProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('المعارض الموثقة')),
      body: dealers.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => Center(
          child: FilledButton.icon(
            onPressed: () => ref.invalidate(dealersProvider),
            icon: const Icon(Icons.refresh),
            label: const Text('إعادة المحاولة'),
          ),
        ),
        data: (items) => items.isEmpty
            ? const Center(child: Text('لا توجد معارض موثقة حالياً'))
            : ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: items.length,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (context, index) {
                  final item = items[index];
                  return Card(
                    child: ListTile(
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => DealerDetailScreen(
                            id: item['id'] as String,
                            isGuest: isGuest,
                            onLogin: onLogin,
                          ),
                        ),
                      ),
                      contentPadding: const EdgeInsets.all(14),
                      leading: const CircleAvatar(
                        child: Icon(Icons.storefront_outlined),
                      ),
                      title: Text(
                        item['name'] as String,
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      subtitle: Text(
                        '${item['city'] ?? 'ليبيا'} · ${item['ratingAverage'] ?? 0}/5',
                      ),
                      trailing: const Icon(Icons.chevron_left),
                    ),
                  );
                },
              ),
      ),
    );
  }
}

class DealerDetailScreen extends ConsumerStatefulWidget {
  const DealerDetailScreen({
    super.key,
    required this.id,
    required this.isGuest,
    this.onLogin,
  });

  final String id;
  final bool isGuest;
  final VoidCallback? onLogin;

  @override
  ConsumerState<DealerDetailScreen> createState() => _DealerDetailScreenState();
}

class _DealerDetailScreenState extends ConsumerState<DealerDetailScreen> {
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
    final detail = ref.watch(dealerDetailProvider(widget.id));
    return Scaffold(
      appBar: AppBar(title: const Text('تفاصيل المعرض')),
      body: detail.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => Center(
          child: FilledButton.icon(
            onPressed: () => ref.invalidate(dealerDetailProvider(widget.id)),
            icon: const Icon(Icons.refresh),
            label: const Text('إعادة المحاولة'),
          ),
        ),
        data: (item) {
          final reviews = (item['reviews'] as List<dynamic>? ?? [])
              .cast<Map<String, dynamic>>();
          final location = [item['city'], item['region'], item['address']]
              .whereType<String>()
              .join(' · ');
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
                            child: Icon(Icons.storefront_outlined),
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
                                Text(location.isEmpty ? 'ليبيا' : location),
                              ],
                            ),
                          ),
                          if (item['verified'] == true)
                            const Icon(
                              Icons.verified,
                              color: Color(0xFF1769D2),
                            ),
                        ],
                      ),
                      const Divider(height: 28),
                      Text(
                        'التقييم ${item['ratingAverage'] ?? 0}/5 · ${item['ratingCount'] ?? 0} تقييم',
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'تقييمات المشترين',
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
              const SizedBox(height: 16),
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
          const Text('سجل الدخول لتقييم المعرض بعد إتمام الشراء.'),
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
            'قيّم المعرض بعد إتمام الشراء',
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
        '/v1/dealers/${widget.id}/reviews',
        data: {'rating': rating, 'comment': comment.text.trim()},
      );
      comment.clear();
      ref.invalidate(dealerDetailProvider(widget.id));
      setState(() => notice = 'تم حفظ تقييمك.');
    } on DioException catch (exception) {
      final data = exception.response?.data;
      final message = data is Map<String, dynamic> ? data['message'] : null;
      setState(() => error = message == 'review.completed_purchase_required'
          ? 'يمكنك التقييم بعد إتمام شراء من هذا المعرض.'
          : 'تعذر حفظ التقييم.');
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }
}
