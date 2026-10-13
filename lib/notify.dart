// إشعارات الهاتف: تظهر فقط والتطبيق في الخلفية أو الشاشة مطفأة.
// والتطبيق مفتوح تكفي نافذة العرض والرسائل القصيرة داخل التطبيق.
import 'package:flutter/widgets.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

final Notifier notify = Notifier();

class Notifier {
  final _plugin = FlutterLocalNotificationsPlugin();
  bool _ready = false;
  bool _foreground = true;
  AppLifecycleListener? _life;

  /// يُستدعى عند الضغط على إشعار، مع الحمولة (مثل chat:ORDER_ID)
  void Function(String payload)? onOpen;

  bool get inBackground => !_foreground;

  static const _updates = AndroidNotificationDetails(
    'updates',
    'الرسائل وتحديثات الطلبات',
    channelDescription: 'رسائل الزبائن، إلغاء الطلبات، وطلبات «اشترِ لي» الجديدة',
    importance: Importance.high,
    priority: Priority.high,
    category: AndroidNotificationCategory.message,
    visibility: NotificationVisibility.public,
  );

  Future<void> init() async {
    _life ??= AppLifecycleListener(onStateChange: (s) => _foreground = s == AppLifecycleState.resumed);
    try {
      await _plugin.initialize(
        settings: const InitializationSettings(android: AndroidInitializationSettings('@mipmap/ic_launcher')),
        onDidReceiveNotificationResponse: (r) {
          final p = r.payload;
          if (p != null && p.isNotEmpty) onOpen?.call(p);
        },
      );
      _ready = true;
    } catch (_) {}
  }

  AndroidFlutterLocalNotificationsPlugin? get _android =>
      _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();

  /// يطلب إذن الإشعارات (أندرويد 13 فما فوق). يرجع true إذا كانت مسموحة.
  Future<bool> requestPermission() async {
    try {
      return await _android?.requestNotificationsPermission() ?? true;
    } catch (_) {
      return false;
    }
  }

  Future<bool?> enabled() async {
    try {
      return await _android?.areNotificationsEnabled();
    } catch (_) {
      return null;
    }
  }

  int _id(String key) => key.hashCode & 0x7fffffff;

  Future<void> _show(String key, String title, String body, AndroidNotificationDetails d, String payload) async {
    if (!_ready || _foreground) return;
    try {
      await _plugin.show(
        id: _id(key),
        title: title,
        body: body,
        notificationDetails: NotificationDetails(android: d),
        payload: payload,
      );
    } catch (_) {}
  }

  Future<void> offer(String orderId, String title, String body, Duration timeout) => _show(
        'offer:$orderId',
        title,
        body,
        AndroidNotificationDetails(
          'offers',
          'عروض التوصيل',
          channelDescription: 'طلب جديد قريب منك ينتظر ردّك',
          importance: Importance.max,
          priority: Priority.max,
          category: AndroidNotificationCategory.call,
          fullScreenIntent: true,
          visibility: NotificationVisibility.public,
          timeoutAfter: timeout.inMilliseconds,
        ),
        'offer:$orderId',
      );

  Future<void> cancelOffer(String orderId) async {
    try {
      await _plugin.cancel(id: _id('offer:$orderId'));
    } catch (_) {}
  }

  Future<void> message(String orderId, String title, String body) =>
      _show('chat:$orderId', title, body, _updates, 'chat:$orderId');

  Future<void> update(String key, String title, String body, String payload) =>
      _show(key, title, body, _updates, payload);
}
