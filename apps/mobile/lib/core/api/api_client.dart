import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

const apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://10.0.2.2:4100',
);

String resolveApiUrl(String value) {
  final uri = Uri.tryParse(value);
  if (uri?.hasScheme == true) return value;
  return Uri.parse(apiBaseUrl).resolve(value).toString();
}

final class ApiClient {
  ApiClient()
      : dio = Dio(
          BaseOptions(
            baseUrl: apiBaseUrl,
            connectTimeout: const Duration(seconds: 10),
            receiveTimeout: const Duration(seconds: 15),
            headers: const {'accept': 'application/json'},
          ),
        ) {
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        const unauthenticated = {'/v1/auth/login', '/v1/auth/register', '/v1/auth/guest', '/v1/auth/refresh'};
        if (!unauthenticated.contains(options.path)) {
          final token = await _storage.read(key: 'access_token');
          if (token != null) options.headers['authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
      onError: (error, handler) async {
        final options = error.requestOptions;
        const unauthenticated = {'/v1/auth/login', '/v1/auth/register', '/v1/auth/guest', '/v1/auth/refresh'};
        final response = error.response?.data;
        final code = response is Map ? response['message'] : null;
        const refreshable = {'auth.access_token_invalid', 'auth.access_token_required', 'auth.session_revoked', 'auth.session_required'};
        if (error.response?.statusCode != 401 || !refreshable.contains(code) || unauthenticated.contains(options.path) || options.extra['retried'] == true) {
          handler.next(error);
          return;
        }
        try {
          _refreshing ??= _refreshTokens().whenComplete(() => _refreshing = null);
          await _refreshing;
          options.extra['retried'] = true;
          final token = await _storage.read(key: 'access_token');
          options.headers['authorization'] = 'Bearer $token';
          handler.resolve(await dio.fetch<dynamic>(options));
        } catch (_) { handler.next(error); }
      },
    ));
  }

  final Dio dio;
  static const _storage = FlutterSecureStorage();
  static Future<void>? _refreshing;

  static Future<void> _refreshTokens() async {
    final token = await _storage.read(key: 'refresh_token');
    if (token == null) throw StateError('Login required');
    final client = Dio(BaseOptions(baseUrl: apiBaseUrl, connectTimeout: const Duration(seconds: 10), receiveTimeout: const Duration(seconds: 15)));
    try {
      final response = await client.post<Map<String, dynamic>>('/v1/auth/refresh', data: {'refreshToken': token});
      await _storage.write(key: 'access_token', value: response.data!['accessToken'] as String);
      await _storage.write(key: 'refresh_token', value: response.data!['refreshToken'] as String);
    } finally { client.close(); }
  }
}
