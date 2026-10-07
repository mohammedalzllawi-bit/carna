import 'dart:async';
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../../features/account/presentation/account_screen.dart';
import '../../features/vehicles/presentation/listing_chat_screen.dart';
import '../../features/auctions/presentation/auctions_screen.dart';
import '../../features/account/presentation/workspace_screen.dart';

@pragma('vm:entry-point')
Future<void> firebaseBackgroundMessage(RemoteMessage message) async {
  await Firebase.initializeApp();
}

class PushNotifications {
  PushNotifications._();
  static final instance = PushNotifications._();

  final messengerKey = GlobalKey<ScaffoldMessengerState>();
  final navigatorKey = GlobalKey<NavigatorState>();
  final _api = ApiClient();
  StreamSubscription<String>? _tokenSubscription;
  RemoteMessage? _initialMessage;
  bool _ready = false;
  bool _active = false;
  String? _registeredToken;

  Future<void> initialize() async {
    if (kIsWeb || !(Platform.isAndroid || Platform.isIOS)) return;
    try {
      await Firebase.initializeApp();
      FirebaseMessaging.onBackgroundMessage(firebaseBackgroundMessage);
      FirebaseMessaging.onMessage.listen((message) {
        final title = message.notification?.title;
        final body = message.notification?.body;
        if (title == null && body == null) return;
        messengerKey.currentState?.showSnackBar(SnackBar(
          content: Text([title, body].whereType<String>().join('\n')),
          duration: const Duration(seconds: 5),
          action: SnackBarAction(label: 'عرض', onPressed: () => _open(message)),
        ));
      });
      FirebaseMessaging.onMessageOpenedApp.listen(_open);
      _initialMessage = await FirebaseMessaging.instance.getInitialMessage();
      _ready = true;
    } catch (error) {
      debugPrint('Firebase initialization unavailable: $error');
    }
  }

  Future<void> activate() async {
    if (!_ready || _active) return;
    _active = true;
    try {
      final messaging = FirebaseMessaging.instance;
      final permission = await messaging.requestPermission();
      if (permission.authorizationStatus != AuthorizationStatus.authorized &&
          permission.authorizationStatus != AuthorizationStatus.provisional) {
        return;
      }
      final token = await messaging.getToken();
      if (token != null) await _register(token);
      _tokenSubscription ??= messaging.onTokenRefresh.listen((token) {
        if (_active) {
          unawaited(_register(token));
        }
      });
      final pending = _initialMessage;
      _initialMessage = null;
      if (pending != null) {
        WidgetsBinding.instance.addPostFrameCallback((_) => _open(pending));
      }
    } catch (error) {
      debugPrint('Push registration unavailable: $error');
    }
  }

  Future<void> _register(String token) async {
    if (!_active) return;
    try {
      final previous = _registeredToken;
      await _api.dio.post('/v1/notifications/devices', data: {
        'token': token,
        'platform': Platform.isIOS ? 'ios' : 'android',
      });
      _registeredToken = token;
      if (previous != null && previous != token) {
        await _api.dio
            .delete('/v1/notifications/devices', data: {'token': previous});
      }
    } catch (error) {
      debugPrint('Push device registration failed: $error');
    }
  }

  Future<void> deactivate() async {
    _active = false;
    final token = _registeredToken;
    _registeredToken = null;
    if (token == null) return;
    try {
      await _api.dio
          .delete('/v1/notifications/devices', data: {'token': token});
    } catch (error) {
      debugPrint('Push device removal failed: $error');
    }
  }

  void _open(RemoteMessage message) {
    if (!_active) return;
    final navigation = navigatorKey.currentState;
    if (navigation == null) return;
    final chatId = message.data['conversationId'];
    final route = message.data['route'];
    final auctionId = route is String &&
            RegExp(r'^/auctions/[a-f0-9-]{36}$', caseSensitive: false)
                .hasMatch(route)
        ? route.split('/').last
        : null;
    navigation.push(MaterialPageRoute<void>(
        builder: (_) => chatId is String && chatId.isNotEmpty
            ? ListingChatScreen(chatId: chatId)
            : auctionId != null
                ? AuctionDetailsScreen(id: auctionId, isGuest: false)
                : route == '/requests'
                    ? const WorkspaceScreen()
                    : const AccountScreen(
                        isGuest: false, notificationsOnly: true)));
  }
}
