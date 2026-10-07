import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../../core/api/api_client.dart';
import '../../../core/branding/platform_branding.dart';
import '../../../core/notifications/push_notifications.dart';
import '../../home/presentation/home_screen.dart';
import '../data/auth_repository.dart';

class AuthState {
  const AuthState({this.loading = false, this.session, this.error});
  final bool loading;
  final AuthSession? session;
  final String? error;
}

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => AuthRepository(ApiClient(), const FlutterSecureStorage()),
);

final authControllerProvider = StateNotifierProvider<AuthController, AuthState>(
  (ref) => AuthController(ref.watch(authRepositoryProvider)),
);

class AuthController extends StateNotifier<AuthState> {
  AuthController(this._repository) : super(const AuthState(loading: true)) {
    restore();
  }

  final AuthRepository _repository;

  Future<void> restore() async {
    try {
      state = AuthState(session: await _repository.restore());
      if (state.session?.mode == 'account') await PushNotifications.instance.activate();
    } catch (_) {
      state = const AuthState(error: 'تعذر الاتصال بخادم المنصة.');
    }
  }

  Future<void> login(String phone, String password) => _run(
        () => _repository.login(phone: phone, password: password),
      );

  Future<void> register(String name, String phone, String password) => _run(
        () => _repository.register(
            fullName: name, phone: phone, password: password),
      );

  Future<void> guest() => _run(_repository.continueAsGuest);

  Future<void> logout() async {
    state = AuthState(loading: true, session: state.session);
    await PushNotifications.instance.deactivate();
    await _repository.logout();
    state = const AuthState();
  }

  Future<void> _run(Future<AuthSession> Function() action) async {
    state = const AuthState(loading: true);
    try {
      state = AuthState(session: await action());
      if (state.session?.mode == 'account') await PushNotifications.instance.activate();
    } on AuthFailure catch (error) {
      state = AuthState(error: error.message);
    } catch (_) {
      state = const AuthState(error: 'تعذر إكمال العملية. حاول مجدداً.');
    }
  }
}

class AuthGate extends ConsumerWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    if (auth.loading && auth.session == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (auth.session != null) {
      return HomeScreen(
          isGuest: auth.session!.mode == 'guest',
          onLogout: () => ref.read(authControllerProvider.notifier).logout());
    }
    return AuthScreen(error: auth.error, loading: auth.loading);
  }
}

class AuthScreen extends ConsumerStatefulWidget {
  const AuthScreen({super.key, this.error, required this.loading});
  final String? error;
  final bool loading;

  @override
  ConsumerState<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends ConsumerState<AuthScreen> {
  final nameController = TextEditingController();
  final phoneController = TextEditingController();
  final passwordController = TextEditingController();
  bool registerMode = false;
  bool obscurePassword = true;
  String? localError;

  @override
  void dispose() {
    nameController.dispose();
    phoneController.dispose();
    passwordController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(22),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Center(child: PlatformLogo(size: 62)),
                  const SizedBox(height: 12),
                  const Text('كارنا',
                      textAlign: TextAlign.center,
                      style:
                          TextStyle(fontSize: 24, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 28),
                  SegmentedButton<bool>(
                    segments: const [
                      ButtonSegment(
                          value: false,
                          label: Text('تسجيل الدخول'),
                          icon: Icon(Icons.login)),
                      ButtonSegment(
                          value: true,
                          label: Text('حساب جديد'),
                          icon: Icon(Icons.person_add_alt_1))
                    ],
                    selected: {registerMode},
                    onSelectionChanged: (value) => setState(() {
                      registerMode = value.first;
                      localError = null;
                    }),
                  ),
                  const SizedBox(height: 20),
                  if (registerMode) ...[
                    TextField(
                        controller: nameController,
                        textInputAction: TextInputAction.next,
                        decoration: const InputDecoration(
                            labelText: 'الاسم الكامل',
                            border: OutlineInputBorder())),
                    const SizedBox(height: 12),
                  ],
                  TextField(
                      controller: phoneController,
                      keyboardType: TextInputType.phone,
                      textDirection: TextDirection.ltr,
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(
                          labelText: 'رقم الهاتف الليبي',
                          hintText: '0912345678',
                          border: OutlineInputBorder())),
                  const SizedBox(height: 12),
                  TextField(
                      controller: passwordController,
                      obscureText: obscurePassword,
                      onSubmitted: (_) => _submit(),
                      decoration: InputDecoration(
                          labelText: 'كلمة المرور',
                          helperText: registerMode ? '8 أحرف على الأقل' : null,
                          border: const OutlineInputBorder(),
                          suffixIcon: IconButton(
                              onPressed: () => setState(
                                  () => obscurePassword = !obscurePassword),
                              icon: Icon(obscurePassword
                                  ? Icons.visibility_outlined
                                  : Icons.visibility_off_outlined)))),
                  if (localError != null || widget.error != null)
                    Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: Text(localError ?? widget.error!,
                            style: const TextStyle(color: Colors.red))),
                  const SizedBox(height: 16),
                  FilledButton(
                      onPressed: widget.loading ? null : _submit,
                      child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 13),
                          child: widget.loading
                              ? const SizedBox(
                                  width: 19,
                                  height: 19,
                                  child:
                                      CircularProgressIndicator(strokeWidth: 2))
                              : Text(registerMode ? 'إنشاء الحساب' : 'دخول'))),
                  const SizedBox(height: 10),
                  OutlinedButton(
                      onPressed: widget.loading
                          ? null
                          : () =>
                              ref.read(authControllerProvider.notifier).guest(),
                      child: const Padding(
                          padding: EdgeInsets.symmetric(vertical: 12),
                          child: Text('متابعة كضيف'))),
                  const SizedBox(height: 8),
                  const Text(
                      'الضيف يستطيع التصفح، بينما المزايدة والفحص والدفع تتطلب حساباً.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Color(0xFF65758B), fontSize: 11)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _submit() {
    final name = nameController.text.trim();
    final phone = phoneController.text.replaceAll(RegExp(r'[\s()-]'), '');
    final password = passwordController.text;
    if (registerMode && name.length < 2) {
      setState(() => localError = 'أدخل الاسم الكامل.');
      return;
    }
    if (!RegExp(r'^(?:0|\+218)9[1-6]\d{7}$').hasMatch(phone)) {
      setState(() => localError = 'أدخل رقم هاتف ليبي صحيحًا مثل 0912345678.');
      return;
    }
    if (registerMode && password.length < 8) {
      setState(
          () => localError = 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.');
      return;
    }
    if (!registerMode && password.isEmpty) {
      setState(() => localError = 'أدخل كلمة المرور.');
      return;
    }
    setState(() => localError = null);
    if (registerMode) {
      ref.read(authControllerProvider.notifier).register(name, phone, password);
    } else {
      ref.read(authControllerProvider.notifier).login(phone, password);
    }
  }
}
