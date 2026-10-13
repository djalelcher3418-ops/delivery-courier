import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';

import '../notify.dart';
import '../store.dart';
import '../ui.dart';
import 'home.dart';

const _good = Color(0xFF0A7D55);

class AccountScreen extends StatefulWidget {
  const AccountScreen({super.key});
  @override
  State<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends State<AccountScreen> with WidgetsBindingObserver {
  bool? gpsOn, notifOn;
  LocationPermission? perm;
  bool testing = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _check();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // يعيد الفحص عند الرجوع من إعدادات الهاتف
  @override
  void didChangeAppLifecycleState(AppLifecycleState s) {
    if (s == AppLifecycleState.resumed) _check();
  }

  Future<void> _check() async {
    try {
      final on = await Geolocator.isLocationServiceEnabled();
      final p = await Geolocator.checkPermission();
      final n = await notify.enabled();
      if (mounted) {
        setState(() {
          gpsOn = on;
          perm = p;
          notifOn = n ?? true;
        });
      }
    } catch (_) {}
  }

  Future<void> _askLocation() async {
    if (perm == LocationPermission.deniedForever) {
      await Geolocator.openAppSettings();
      return;
    }
    try {
      await Geolocator.requestPermission();
    } catch (_) {}
    await _check();
    if (app.online) app.startTracking();
  }

  Future<void> _askNotif() async {
    final ok = await notify.requestPermission();
    if (!ok) await Geolocator.openAppSettings();
    await _check();
  }

  Future<void> _testSound() async {
    setState(() => testing = true);
    await app.alert(2);
    if (mounted) setState(() => testing = false);
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: app,
      builder: (context, _) {
        final c = app.me;
        if (c == null) return const Center(child: CircularProgressIndicator());
        final theme = Theme.of(context);
        final hint = theme.hintColor;
        final r = app.rating;
        final rc = asInt(c['ratingCount']);
        final permOk = perm == LocationPermission.always || perm == LocationPermission.whileInUse;

        return ListView(padding: EdgeInsets.zero, children: [
          TopHero(sub: 'حسابي', children: [
            const SizedBox(height: 8),
            Text('${c['phone'] ?? ''}',
                textDirection: TextDirection.ltr,
                textAlign: TextAlign.right,
                style: const TextStyle(color: Colors.white70, fontSize: 15)),
          ]),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Box(
                child: Row(children: [
                  const Icon(Icons.star_rounded, color: star, size: 36),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(r == null ? 'لا تقييم بعد' : '${r.toStringAsFixed(1)} من 5',
                          style: theme.textTheme.titleMedium),
                      Text(r == null ? 'يقيّمك الزبائن بعد كل توصيلة.' : 'من $rc تقييم عند الزبائن',
                          style: TextStyle(color: hint, fontSize: 13)),
                    ]),
                  ),
                ]),
              ),
              const SizedBox(height: 18),
              Text('حتى لا يفوتك طلب', style: theme.textTheme.titleMedium),
              const SizedBox(height: 8),
              Box(
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  _CheckRow(
                    ok: gpsOn,
                    title: 'GPS',
                    okText: 'مشغّل',
                    badText: 'مطفأ · لن نعرف قربك من المحلات',
                    action: gpsOn == false ? 'فتح الإعدادات' : null,
                    onAction: () async {
                      await Geolocator.openLocationSettings();
                    },
                  ),
                  const Divider(height: 20),
                  _CheckRow(
                    ok: perm == null ? null : permOk,
                    title: 'إذن الموقع',
                    okText: 'مسموح',
                    badText: perm == LocationPermission.deniedForever ? 'مرفوض · اسمح به من الإعدادات' : 'غير مسموح بعد',
                    action: perm != null && !permOk ? 'السماح' : null,
                    onAction: _askLocation,
                  ),
                  const Divider(height: 20),
                  _CheckRow(
                    ok: notifOn,
                    title: 'الإشعارات',
                    okText: 'مسموحة · تصلك العروض والشاشة مطفأة',
                    badText: 'ممنوعة · لن تعرف بالطلبات والتطبيق في الخلفية',
                    action: notifOn == false ? 'السماح' : null,
                    onAction: _askNotif,
                  ),
                  const Divider(height: 20),
                  Row(children: [
                    Icon(Icons.volume_up_rounded, color: hint),
                    const SizedBox(width: 10),
                    const Expanded(
                      child: Text('صوت التنبيه', style: TextStyle(fontWeight: FontWeight.w600)),
                    ),
                    OutlinedButton(
                      style: OutlinedButton.styleFrom(minimumSize: const Size(0, 40)),
                      onPressed: testing ? null : _testSound,
                      child: const Text('جرّب الصوت'),
                    ),
                  ]),
                  const SizedBox(height: 4),
                  Text('إذا لم تسمعه، ارفع صوت الوسائط في الهاتف.', style: TextStyle(color: hint, fontSize: 12)),
                ]),
              ),
              const SizedBox(height: 12),
              Box(
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Text('لتصلك الطلبات والشاشة مطفأة', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 8),
                  const _Tip('أبقِ إشعار «أنت متصل» ظاهراً، فهو ما يبقي التطبيق شغالاً.'),
                  const _Tip('في إعدادات البطارية اختر «بدون قيود» أو «غير محسّن» لتطبيق Delivery موصّل.'),
                  const _Tip('لا تغلق التطبيق من قائمة التطبيقات المفتوحة وأنت متصل.'),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: () => Geolocator.openAppSettings(),
                    icon: const Icon(Icons.settings_rounded),
                    label: const Text('فتح إعدادات التطبيق'),
                  ),
                ]),
              ),
              const SizedBox(height: 18),
              OutlinedButton.icon(
                style: OutlinedButton.styleFrom(foregroundColor: Colors.red.shade700),
                onPressed: () async {
                  if (await confirm(context, 'تسجيل الخروج', 'ستصبح غير متصل ولن تصلك الطلبات.', 'خروج')) app.logout();
                },
                icon: const Icon(Icons.logout_rounded),
                label: const Text('تسجيل الخروج'),
              ),
            ]),
          ),
        ]);
      },
    );
  }
}

class _CheckRow extends StatelessWidget {
  final bool? ok;
  final String title, okText, badText;
  final String? action;
  final VoidCallback onAction;
  const _CheckRow({
    required this.ok,
    required this.title,
    required this.okText,
    required this.badText,
    required this.action,
    required this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    final hint = Theme.of(context).hintColor;
    final color = ok == null ? hint : (ok! ? _good : warn);
    return Row(children: [
      Icon(ok == null ? Icons.more_horiz_rounded : (ok! ? Icons.check_circle_rounded : Icons.warning_amber_rounded), color: color),
      const SizedBox(width: 10),
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
          Text(ok == null ? 'جارٍ الفحص…' : (ok! ? okText : badText), style: TextStyle(color: hint, fontSize: 13)),
        ]),
      ),
      if (action != null)
        FilledButton(
          style: FilledButton.styleFrom(minimumSize: const Size(0, 40), backgroundColor: warn),
          onPressed: onAction,
          child: Text(action!),
        ),
    ]);
  }
}

class _Tip extends StatelessWidget {
  final String text;
  const _Tip(this.text);

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Padding(
            padding: const EdgeInsets.only(top: 3),
            child: Icon(Icons.check_rounded, size: 16, color: Theme.of(context).hintColor),
          ),
          const SizedBox(width: 6),
          Expanded(child: Text(text, style: const TextStyle(height: 1.4))),
        ]),
      );
}
