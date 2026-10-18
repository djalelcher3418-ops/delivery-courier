import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'notify.dart';
import 'screens/chat.dart';
import 'screens/job.dart';
import 'screens/login.dart';
import 'screens/offer.dart';
import 'screens/shell.dart';
import 'status_bar.dart';
import 'store.dart';
import 'ui.dart';

// نفس مشروع Firebase الذي يستعمله الموقع وتطبيق الزبون (dilivery-93064)
const firebaseOptions = FirebaseOptions(
  apiKey: 'AIzaSyAnAmGrt_gFF7-Y1ZVoq4I5PEaoaKjXbrg',
  appId: '1:248490849459:web:57c1746b9ce6c363bb6cc6',
  messagingSenderId: '248490849459',
  projectId: 'dilivery-93064',
  authDomain: 'dilivery-93064.firebaseapp.com',
  storageBucket: 'dilivery-93064.firebasestorage.app',
);

final messengerKey = GlobalKey<ScaffoldMessengerState>();
final navKey = GlobalKey<NavigatorState>();

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(options: firebaseOptions);
  status.watch = app;
  status.batteryRelevant = () => app.online;
  status.start();
  app.onToast = (m) {
    final s = messengerKey.currentState;
    if (s == null) return;
    s.hideCurrentSnackBar();
    s.showSnackBar(SnackBar(content: Text(m), behavior: SnackBarBehavior.floating));
  };
  notify.onOpen = _openFromNotification;
  await notify.init();
  await app.init();
  runApp(const CourierApp());
}

// الضغط على إشعار يفتح الصفحة المعنية (نافذة العرض تظهر وحدها فوق كل الصفحات)
void _openFromNotification(String payload) {
  final nav = navKey.currentState;
  if (nav == null || app.role != 'courier') return;
  final i = payload.indexOf(':');
  final kind = i < 0 ? payload : payload.substring(0, i);
  final id = i < 0 ? '' : payload.substring(i + 1);
  nav.popUntil((r) => r.isFirst);
  if (kind == 'chat' && id.isNotEmpty) {
    nav.push(MaterialPageRoute(builder: (_) => JobScreen(orderId: id)));
    nav.push(MaterialPageRoute(builder: (_) => ChatScreen(orderId: id)));
  } else if (kind == 'job' && id.isNotEmpty) {
    nav.push(MaterialPageRoute(builder: (_) => JobScreen(orderId: id)));
  }
}

ThemeData buildTheme(Brightness b) {
  final dark = b == Brightness.dark;
  final surface = dark ? const Color(0xFF1A202B) : Colors.white;
  final onSurface = dark ? const Color(0xFFEDEFF3) : ink;
  final scheme = ColorScheme.fromSeed(seedColor: brand, brightness: b).copyWith(
    primary: dark ? const Color(0xFF9FB3E8) : brand,
    onPrimary: dark ? const Color(0xFF10141C) : Colors.white,
    secondary: tea,
    surface: surface,
    onSurface: onSurface,
    outlineVariant: dark ? Colors.white24 : hairline,
  );
  final base = ThemeData(useMaterial3: true, colorScheme: scheme, brightness: b, fontFamily: 'Plex');
  // النصوص بخط IBM Plex Sans Arabic، والعناوين بخط Baloo Bhaijaan 2 (كلاهما مضمّن في assets/fonts)
  final text = base.textTheme.apply(fontFamily: 'Plex', bodyColor: onSurface, displayColor: onSurface);
  TextStyle head(TextStyle? t, FontWeight w) => (t ?? const TextStyle()).copyWith(fontFamily: 'Baloo', fontWeight: w, height: 1.25);
  final shape14 = RoundedRectangleBorder(borderRadius: BorderRadius.circular(14));
  // الزر الرئيسي نيلي في الوضعين (أفتح قليلاً في الداكن)، والنص عليه أبيض
  final btn = dark ? const Color(0xFF2E4482) : brand;
  return base.copyWith(
    scaffoldBackgroundColor: dark ? const Color(0xFF10141C) : paper,
    hintColor: dark ? const Color(0xFFA3ABBA) : muted,
    dividerColor: dark ? Colors.white12 : const Color(0xFFEEF0F4),
    textTheme: text.copyWith(
      headlineMedium: head(text.headlineMedium, FontWeight.w800),
      headlineSmall: head(text.headlineSmall, FontWeight.w800),
      titleLarge: head(text.titleLarge, FontWeight.w800),
      titleMedium: head(text.titleMedium, FontWeight.w700),
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: dark ? const Color(0xFF10141C) : paper,
      foregroundColor: onSurface,
      surfaceTintColor: Colors.transparent,
      titleTextStyle: head(text.titleLarge, FontWeight.w700).copyWith(color: onSurface, fontSize: 21),
    ),
    cardTheme: base.cardTheme.copyWith(
      elevation: 0,
      margin: EdgeInsets.zero,
      color: surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: scheme.outlineVariant)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: scheme.outlineVariant)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: scheme.primary, width: 1.6)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: btn,
        foregroundColor: Colors.white,
        disabledBackgroundColor: dark ? Colors.white12 : const Color(0xFFE3E7ED),
        disabledForegroundColor: dark ? Colors.white38 : muted,
        minimumSize: const Size.fromHeight(54),
        shape: shape14,
        textStyle: const TextStyle(fontFamily: 'Plex', fontWeight: FontWeight.w700, fontSize: 16),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(0, 48),
        padding: const EdgeInsets.symmetric(horizontal: 14),
        foregroundColor: onSurface,
        side: BorderSide(color: scheme.outlineVariant),
        shape: shape14,
        textStyle: const TextStyle(fontFamily: 'Plex', fontWeight: FontWeight.w600, fontSize: 15),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: scheme.primary,
        shape: shape14,
        textStyle: const TextStyle(fontFamily: 'Plex', fontWeight: FontWeight.w600, fontSize: 15),
      ),
    ),
    iconButtonTheme: IconButtonThemeData(style: IconButton.styleFrom(minimumSize: const Size(44, 44))),
    // الشرائح: مستطيلات بزوايا 12، والمختارة نيلية
    chipTheme: base.chipTheme.copyWith(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      side: WidgetStateBorderSide.resolveWith(
          (s) => s.contains(WidgetState.selected) ? BorderSide.none : BorderSide(color: scheme.outlineVariant)),
      color: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? (dark ? const Color(0xFFEDEFF3) : ink) : surface),
      labelStyle: TextStyle(
        fontFamily: 'Plex',
        fontWeight: FontWeight.w600,
        color: WidgetStateColor.resolveWith(
            (s) => s.contains(WidgetState.selected) ? (dark ? const Color(0xFF10141C) : Colors.white) : onSurface),
      ),
      checkmarkColor: dark ? const Color(0xFF10141C) : Colors.white,
    ),
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: SegmentedButton.styleFrom(
        selectedBackgroundColor: dark ? const Color(0xFFEDEFF3) : ink,
        selectedForegroundColor: dark ? ink : Colors.white,
        foregroundColor: onSurface,
        side: BorderSide(color: scheme.outlineVariant),
        shape: shape14,
        textStyle: const TextStyle(fontFamily: 'Plex', fontWeight: FontWeight.w600, fontSize: 14.5),
      ),
    ),
    switchTheme: SwitchThemeData(
      trackOutlineColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? Colors.transparent : null),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
    ),
    dialogTheme: base.dialogTheme.copyWith(
      backgroundColor: surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
    ),
    badgeTheme: const BadgeThemeData(backgroundColor: tea, textColor: Colors.white),
    progressIndicatorTheme: ProgressIndicatorThemeData(color: scheme.primary),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: dark ? const Color(0xFFEDEFF3) : ink,
      contentTextStyle: TextStyle(color: dark ? ink : Colors.white, fontFamily: 'Plex'),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
    ),
  );
}

class CourierApp extends StatelessWidget {
  const CourierApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Delivery موصّل',
      debugShowCheckedModeBanner: false,
      scaffoldMessengerKey: messengerKey,
      navigatorKey: navKey,
      // عرض الطلب الجديد يظهر فوق أي صفحة مفتوحة
      builder: (context, child) => ListenableBuilder(
        listenable: app,
        builder: (context, _) {
          final offer = app.role == 'courier' ? app.currentOffer : null;
          return Stack(children: [
            StatusBars(child: child ?? const SizedBox.shrink()),
            if (offer != null) OfferOverlay(offer: offer, navKey: navKey),
          ]);
        },
      ),
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      theme: buildTheme(Brightness.light),
      darkTheme: buildTheme(Brightness.dark),
      home: ListenableBuilder(
        listenable: app,
        builder: (context, _) {
          if (!app.ready || app.role == 'resolving') {
            return const Scaffold(body: Center(child: CircularProgressIndicator()));
          }
          if (app.user == null) return const LoginScreen();
          if (app.role == 'courier') return const Shell();
          return const _Unlinked();
        },
      ),
    );
  }
}

class _Unlinked extends StatelessWidget {
  const _Unlinked();

  @override
  Widget build(BuildContext context) {
    final uid = FirebaseAuth.instance.currentUser?.uid ?? '';
    return Scaffold(
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.all(24), children: [
          const SizedBox(height: 40),
          Center(
            child: StarBadge(
              size: 84,
              color: isDark(context) ? Colors.white12 : brandSoft,
              child: Icon(Icons.no_accounts_rounded, size: 38, color: isDark(context) ? Colors.white : brand),
            ),
          ),
          const SizedBox(height: 16),
          Text(app.role == 'error' ? 'تعذّر فتح حسابك' : 'هذا الحساب ليس حساب موصّل',
              textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          Text(
            app.role == 'error'
                ? app.roleErr
                : 'هذا التطبيق للموصّلين فقط. اطلب من الإدارة إضافتك كموصّل، ثم ادخل برقمك وكلمة السر.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Theme.of(context).hintColor),
          ),
          const SizedBox(height: 20),
          Box(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('رمز الحساب (UID)', style: TextStyle(color: Theme.of(context).hintColor, fontSize: 12)),
              const SizedBox(height: 4),
              SelectableText(uid, textDirection: TextDirection.ltr),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: () {
                  Clipboard.setData(ClipboardData(text: uid));
                  app.toast('نُسخ الرمز');
                },
                icon: const Icon(Icons.copy_rounded),
                label: const Text('نسخ الرمز'),
              ),
            ]),
          ),
          const SizedBox(height: 16),
          FilledButton(onPressed: app.logout, child: const Text('تسجيل الخروج')),
        ]),
      ),
    );
  }
}
