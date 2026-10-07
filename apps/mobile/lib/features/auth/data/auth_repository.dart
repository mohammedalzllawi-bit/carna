import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../../core/api/api_client.dart';

class AuthFailure implements Exception {
  const AuthFailure(this.message);
  final String message;
}

class AuthSession {
  const AuthSession({required this.mode, this.user});
  final String mode;
  final Map<String, dynamic>? user;
}

final class AuthRepository {
  AuthRepository(this._apiClient, this._storage);

  final ApiClient _apiClient;
  final FlutterSecureStorage _storage;

  Future<AuthSession?> restore() async {
    final accessToken = await _storage.read(key: 'access_token');
    if (accessToken == null) {
      final response = await _apiClient.dio.get<Map<String, dynamic>>('/v1/settings/public');
      if (response.data?['platform.guest_mode_enabled'] == true && response.data?['platform.maintenance_mode'] != true) return continueAsGuest();
      return null;
    }
    try {
      final response = await _apiClient.dio.get<Map<String, dynamic>>(
        '/v1/auth/me',
        options: Options(headers: {'authorization': 'Bearer $accessToken'}),
      );
      return AuthSession(mode: 'account', user: response.data);
    } on DioException catch (error) {
      if (error.response?.statusCode != 401) rethrow;
      return refresh();
    }
  }

  Future<AuthSession> login({required String phone, required String password}) async {
    try {
      final response = await _apiClient.dio.post<Map<String, dynamic>>(
        '/v1/auth/login',
        data: {'phone': phone, 'password': password},
      );
      return _storeTokens(response.data!);
    } on DioException catch (error) {
      throw AuthFailure(_messageFor(error, registering: false));
    }
  }

  Future<AuthSession> register({required String fullName, required String phone, required String password}) async {
    try {
      final response = await _apiClient.dio.post<Map<String, dynamic>>(
        '/v1/auth/register',
        data: {'fullName': fullName, 'phone': phone, 'password': password},
      );
      return _storeTokens(response.data!);
    } on DioException catch (error) {
      throw AuthFailure(_messageFor(error, registering: true));
    }
  }

  Future<AuthSession> continueAsGuest() async {
    await _apiClient.dio.post<Map<String, dynamic>>('/v1/auth/guest');
    await _storage.deleteAll();
    await _storage.write(key: 'guest_mode', value: 'true');
    return const AuthSession(mode: 'guest');
  }

  Future<AuthSession?> refresh() async {
    final refreshToken = await _storage.read(key: 'refresh_token');
    if (refreshToken == null) return null;
    try {
      final response = await _apiClient.dio.post<Map<String, dynamic>>(
        '/v1/auth/refresh',
        data: {'refreshToken': refreshToken},
      );
      return _storeTokens(response.data!);
    } on DioException catch (error) {
      if (error.response?.statusCode != 401) rethrow;
      await _storage.deleteAll();
      return null;
    }
  }

  Future<void> logout() async {
    final refreshToken = await _storage.read(key: 'refresh_token');
    try {
      await _apiClient.dio.post<void>('/v1/auth/logout', data: {'refreshToken': refreshToken});
    } finally {
      await _storage.deleteAll();
    }
  }

  Future<AuthSession> _storeTokens(Map<String, dynamic> data) async {
    await _storage.delete(key: 'guest_mode');
    await _storage.write(key: 'access_token', value: data['accessToken'] as String);
    await _storage.write(key: 'refresh_token', value: data['refreshToken'] as String);
    return AuthSession(mode: 'account', user: data['user'] as Map<String, dynamic>);
  }

  String _messageFor(DioException error, {required bool registering}) {
    final data = error.response?.data;
    final raw = data is Map<String, dynamic> ? data['message'] : null;
    final messages = raw is List ? raw.join(' ') : raw?.toString() ?? '';
    if (messages.contains('auth.phone_already_registered')) {
      return 'رقم الهاتف مسجل مسبقًا. اختر تسجيل الدخول بدل إنشاء حساب جديد.';
    }
    if (messages.contains('phone must be a valid')) {
      return 'أدخل رقم هاتف ليبي صحيحًا مثل 0912345678.';
    }
    if (messages.contains('password must be longer')) {
      return 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.';
    }
    if (messages.contains('auth.invalid_credentials')) {
      return 'رقم الهاتف أو كلمة المرور غير صحيحة.';
    }
    if (error.type == DioExceptionType.connectionTimeout ||
        error.type == DioExceptionType.receiveTimeout ||
        error.type == DioExceptionType.connectionError) {
      return 'تعذر الاتصال بالخادم. تحقق من الشبكة ثم حاول مجددًا.';
    }
    return registering
        ? 'تعذر إنشاء الحساب الآن. تحقق من البيانات وحاول مجددًا.'
        : 'تعذر تسجيل الدخول الآن. حاول مجددًا.';
  }
}
