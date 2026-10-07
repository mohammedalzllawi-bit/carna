import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/api_client.dart';

class PlatformBranding {
  const PlatformBranding({this.logoUrl});

  final String? logoUrl;

  factory PlatformBranding.fromJson(Map<String, dynamic> json) {
    final value = json['platform.logo_url'];
    return PlatformBranding(
      logoUrl: value is String && value.trim().isNotEmpty ? value.trim() : null,
    );
  }
}

final platformBrandingProvider = FutureProvider<PlatformBranding>((ref) async {
  final response =
      await ApiClient().dio.get<Map<String, dynamic>>('/v1/settings/public');
  return PlatformBranding.fromJson(response.data ?? const {});
});

class PlatformLogo extends ConsumerWidget {
  const PlatformLogo({
    super.key,
    this.size = 40,
    this.fallbackColor = const Color(0xFF1769D2),
  });

  final double size;
  final Color fallbackColor;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final branding = ref.watch(platformBrandingProvider);
    final logoUrl = branding.valueOrNull?.logoUrl;
    if (logoUrl == null) return _fallback();

    return SizedBox.square(
      dimension: size,
      child: Image.network(
        resolveApiUrl(logoUrl),
        fit: BoxFit.contain,
        semanticLabel: 'شعار كارنا',
        errorBuilder: (_, __, ___) => _fallback(),
      ),
    );
  }

  Widget _fallback() => Icon(
        Icons.directions_car_filled_outlined,
        size: size,
        color: fallbackColor,
      );
}
