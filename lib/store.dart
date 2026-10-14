// Delivery — حالة تطبيق الموصّل والاتصال بـ Firebase (نفس قاعدة بيانات الموقع)
import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:audioplayers/audioplayers.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'notify.dart';

typedef Doc = Map<String, dynamic>;

final CourierState app = CourierState();

const loginDomain = 'delivery-dz.com';
const offerMs = 60000; // مدة عرض الطلب على الموصّل قبل أن ينتقل للذي بعده
const ringEveryMs = 6000; // يتكرر صوت العرض حتى يرد الموصّل
const activeStatuses = ['new', 'prep', 'ready', 'road'];
const jobStatuses = ['prep', 'ready', 'road'];
const closedStatuses = ['cancelled', 'rejected'];
const historyDays = 30; // كم يوماً يظهر في السجل

int asInt(dynamic v) => v is num ? v.toInt() : (int.tryParse('$v') ?? 0);
double? asD(dynamic v) => v is num ? v.toDouble() : null;
int msOf(dynamic v) {
  if (v is Timestamp) return v.millisecondsSinceEpoch;
  if (v is num) return v.toInt();
  return DateTime.now().millisecondsSinceEpoch;
}

int nowMs() => DateTime.now().millisecondsSinceEpoch;

String latinDigits(String s) {
  const ar = '٠١٢٣٤٥٦٧٨٩';
  const fa = '۰۱۲۳۴۵۶۷۸۹';
  final b = StringBuffer();
  for (final ch in s.split('')) {
    final i = ar.indexOf(ch);
    final j = fa.indexOf(ch);
    b.write(i >= 0 ? '$i' : (j >= 0 ? '$j' : ch));
  }
  return b.toString();
}

int? parseInt(String s) => int.tryParse(latinDigits(s).replaceAll(RegExp(r'[\s,.]'), ''));
String cleanPhone(String p) => latinDigits(p).replaceAll(RegExp(r'[\s.\-]'), '');
bool phoneOk(String p) => RegExp(r'^0[5-7]\d{8}$').hasMatch(p);

String fmt(num n) {
  final s = n.round().abs().toString();
  final b = StringBuffer(n < 0 ? '-' : '');
  for (int i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) b.write(' ');
    b.write(s[i]);
  }
  return b.toString();
}


/// كتابة في Firestore: تُحفظ في الهاتف فوراً وتظهر في الشاشة، ثم تُرسل حين يتوفر الاتصال.
/// لا ننتظر رد الخادم أكثر من 8 ثوانٍ حتى لا تعلق الأزرار مع الشبكة الضعيفة.
/// ترجع true إذا أكّد الخادم، و false إذا بقيت تنتظر الاتصال.
Future<bool> queued(Future<void> write) async {
  try {
    await write.timeout(const Duration(seconds: 8));
    return true;
  } on TimeoutException {
    return false;
  }
}

const pendingNote = 'سيُرسل عند عودة الاتصال';

String money(num n) => '${fmt(n)} دج';

/// عدد التوصيلات بصيغة عربية سليمة
String deliveries(int n) {
  if (n == 0) return 'لا توصيلات';
  if (n == 1) return 'توصيلة واحدة';
  if (n == 2) return 'توصيلتان';
  if (n <= 10) return '$n توصيلات';
  return '$n توصيلة';
}
String two(int n) => n.toString().padLeft(2, '0');
String clock(int ms) {
  final d = DateTime.fromMillisecondsSinceEpoch(ms);
  return '${two(d.hour)}:${two(d.minute)}';
}

int startOfToday() {
  final n = DateTime.now();
  return DateTime(n.year, n.month, n.day).millisecondsSinceEpoch;
}

double? km(double? aLat, double? aLng, double? bLat, double? bLng) {
  if (aLat == null || aLng == null || bLat == null || bLng == null) return null;
  const r = 6371.0;
  final dLa = (bLat - aLat) * math.pi / 180, dLo = (bLng - aLng) * math.pi / 180;
  final x = math.sin(dLa / 2) * math.sin(dLa / 2) +
      math.cos(aLat * math.pi / 180) * math.cos(bLat * math.pi / 180) * math.sin(dLo / 2) * math.sin(dLo / 2);
  return 2 * r * math.atan2(math.sqrt(x), math.sqrt(1 - x));
}

String kmText(double? d) => d == null ? '' : (d < 1 ? '${(d * 1000).round()} م' : '${d.toStringAsFixed(1)} كم');

bool isAny(Doc o) => o['kind'] == 'any';

String optsText(Map i) {
  final a = <String>[];
  if ((i['size'] ?? '').toString().isNotEmpty) a.add('${i['size']}');
  final ex = i['extras'];
  if (ex is List && ex.isNotEmpty) a.add('+ ${ex.join('، ')}');
  if ((i['note'] ?? '').toString().isNotEmpty) a.add('«${i['note']}»');
  return a.join(' · ');
}

List<Map> itemsOf(Doc o) => (o['items'] is List) ? (o['items'] as List).whereType<Map>().toList() : <Map>[];
String itemsText(Doc o) => itemsOf(o).map((i) => '${asInt(i['qty'])}× ${i['name'] ?? ''}').join(' · ');

String errText(Object e) {
  String code = '';
  if (e is FirebaseAuthException) code = 'auth/${e.code}';
  if (e is FirebaseException && e is! FirebaseAuthException) code = e.code;
  const m = {
    'auth/invalid-credential': 'رقم الهاتف أو كلمة السر غير صحيحة.',
    'auth/invalid-login-credentials': 'رقم الهاتف أو كلمة السر غير صحيحة.',
    'auth/wrong-password': 'رقم الهاتف أو كلمة السر غير صحيحة.',
    'auth/user-not-found': 'رقم الهاتف أو كلمة السر غير صحيحة.',
    'auth/invalid-email': 'رقم الهاتف غير صحيح.',
    'auth/too-many-requests': 'محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة.',
    'auth/network-request-failed': 'لا يوجد اتصال بالإنترنت. تحقق من الشبكة وأعد المحاولة.',
    'permission-denied': 'ليست لديك صلاحية لهذه العملية.',
    'unavailable': 'لا يوجد اتصال بالخادم الآن. أعد المحاولة بعد قليل.',
    'not-found': 'لم نجد هذه البيانات. قد تكون حُذفت.',
    'gone': 'انتهى وقت هذا العرض أو أخذه موصّل آخر.',
  };
  if (e is StateError && e.message == 'gone') return m['gone']!;
  return m[code] ?? 'حدث خطأ غير متوقع (${code.isEmpty ? e : code}).';
}

class CourierState extends ChangeNotifier {
  final auth = FirebaseAuth.instance;
  final fs = FirebaseFirestore.instance;
  final _player = AudioPlayer();

  bool ready = false;
  User? user;
  String role = ''; // '' | resolving | courier | unlinked | error
  String roleErr = '';

  Doc? me;
  Map<String, Doc> shops = {};
  Doc config = {};
  List<Doc> orders = [], pool = [], offers = [];
  bool loadedOrders = false, loadedConfig = false;

  String geoErr = '';
  double? lat, lng;
  StreamSubscription<Position>? _geoSub;
  Timer? _beat;
  int _lastWrite = 0;

  final Map<String, int> _offerSeen = {};
  final Map<String, int> _msgSeenN = {};
  final Map<String, String> _statusSeen = {};
  final Set<String> _doneByMe = {};
  Map<String, int> seen = {};
  String? openChatId;

  final List<StreamSubscription> _subs = [];
  Timer? _tick; // ignore: unused_field
  bool _selfCheckBusy = false;
  bool _hadOffer = false;
  int _lastRing = 0;
  String? _ringingFor; // رقم الطلب الذي يرنّ عرضه الآن
  void Function(String msg)? onToast;

  void toast(String m) => onToast?.call(m);

  Future<void> init() async {
    final p = await SharedPreferences.getInstance();
    try {
      final s = p.getString('seen');
      if (s != null) seen = Map<String, int>.from((jsonDecode(s) as Map).map((k, v) => MapEntry('$k', asInt(v))));
    } catch (_) {}
    auth.authStateChanges().listen(_onUser);
    _tick = Timer.periodic(const Duration(seconds: 1), (_) => _onTick());
  }

  Future<void> _saveSeen() async {
    final p = await SharedPreferences.getInstance();
    await p.setString('seen', jsonEncode(seen));
  }

  // ---------------- auth ----------------
  Future<void> _onUser(User? u) async {
    _stopAll();
    stopTracking();
    user = u;
    me = null;
    orders = [];
    pool = [];
    offers = [];
    loadedOrders = false;
    loadedConfig = false;
    role = '';
    roleErr = '';
    ready = true;
    if (u == null) {
      notifyListeners();
      return;
    }
    if (u.isAnonymous) {
      role = 'unlinked';
      notifyListeners();
      return;
    }
    role = 'resolving';
    notifyListeners();
    try {
      final r = await fs.collection('users').doc(u.uid).get();
      final d = r.data();
      if (d != null && d['role'] == 'courier') {
        role = 'courier';
        _startCourier(u.uid);
      } else {
        role = 'unlinked';
      }
    } catch (e) {
      role = 'error';
      roleErr = errText(e);
    }
    notifyListeners();
  }

  Future<void> login(String phone, String pass) async {
    final p = cleanPhone(phone);
    await auth.signInWithEmailAndPassword(email: '$p@$loginDomain', password: pass);
  }

  Future<void> logout() async {
    if (me != null) {
      try {
        await fs.collection('couriers').doc(user!.uid).update({'online': false});
      } catch (_) {}
    }
    stopTracking();
    await auth.signOut();
  }

  // ---------------- listeners ----------------
  void _stopAll() {
    for (final s in _subs) {
      s.cancel();
    }
    _subs.clear();
  }

  Doc _doc(DocumentSnapshot<Map<String, dynamic>> d) {
    final x = Map<String, dynamic>.from(d.data() ?? {});
    x['id'] = d.id;
    x['createdAtMs'] = msOf(x['createdAt']);
    return x;
  }

  void _startCourier(String uid) {
    notify.requestPermission();
    _subs.add(fs.collection('shops').snapshots().listen((s) {
      shops = {for (final d in s.docs) d.id: _doc(d)};
      notifyListeners();
    }, onError: (_) {}));
    _subs.add(fs.collection('config').doc('platform').snapshots().listen((s) {
      config = s.data() ?? {};
      loadedConfig = true;
      notifyListeners();
    }, onError: (_) => loadedConfig = true));
    _subs.add(fs.collection('couriers').doc(uid).snapshots().listen((s) {
      me = s.exists ? _doc(s) : null;
      if (me == null) {
        role = 'unlinked';
      } else {
        final on = me!['online'] == true;
        if (on && _geoSub == null && _beat == null) startTracking();
        if (!on && (_geoSub != null || _beat != null)) stopTracking();
      }
      notifyListeners();
    }, onError: (e) {
      role = 'error';
      roleErr = errText(e);
      notifyListeners();
    }));

    bool first = true;
    _subs.add(fs.collection('orders').where('courierUid', isEqualTo: uid).snapshots().listen((s) {
      orders = s.docs.map(_doc).toList();
      loadedOrders = true;
      for (final c in s.docChanges) {
        if (c.type == DocumentChangeType.removed) continue;
        final o = c.doc.data() ?? {};
        final id = c.doc.id, n = asInt(o['msgN']), prev = _msgSeenN[id];
        _msgSeenN[id] = n;
        if (!first && prev != null && n > prev && o['lastMsgBy'] == 'customer' && openChatId != id) {
          alert(1);
          toast('رسالة من الزبون: ${o['lastMsgText'] ?? 'رسالة جديدة'}');
          notify.message(id, 'رسالة من الزبون · طلب ${o['no'] ?? ''}', '${o['lastMsgText'] ?? 'رسالة جديدة'}');
        }
        final st = '${o['status'] ?? ''}', was = _statusSeen[id];
        _statusSeen[id] = st;
        if (!first && was != null && was != st && jobStatuses.contains(was)) {
          if (closedStatuses.contains(st)) {
            alert(2);
            toast('أُلغي الطلب رقم ${o['no'] ?? ''}. لا تشترِ ولا تسلّم شيئاً.');
            notify.update('cancel:$id', 'أُلغي الطلب رقم ${o['no'] ?? ''}', 'لا تشترِ ولا تسلّم شيئاً.', 'job:$id');
          } else if (st == 'done' && !_doneByMe.remove(id)) {
            toast('سجّل الزبون استلام الطلب رقم ${o['no'] ?? ''} · أُضيف إلى حصيلتك');
          }
        }
      }
      first = false;
      notifyListeners();
    }, onError: (e) => toast(errText(e))));

    bool firstPool = true;
    _subs.add(fs
        .collection('orders')
        .where('kind', isEqualTo: 'any')
        .where('status', isEqualTo: 'prep')
        .snapshots()
        .listen((s) {
      pool = s.docs.map(_doc).toList();
      if (!firstPool && online && block.isEmpty) {
        final added = s.docChanges.any((c) => c.type == DocumentChangeType.added && c.doc.data()?['courierUid'] == null);
        if (added) {
          alert(2);
          toast('طلب «اشترِ لي» جديد ينتظر موصّلاً');
          notify.update('pool', 'طلب «اشترِ لي» جديد', 'افتح التطبيق لترى الطلب وتقبله قبل غيرك.', 'home');
        }
      }
      firstPool = false;
      notifyListeners();
    }, onError: (_) {}));

    _subs.add(fs.collection('orders').where('offerTo', isEqualTo: uid).snapshots().listen((s) {
      offers = s.docs.map(_doc).toList();
      bool got = false;
      for (final c in s.docChanges) {
        final o = c.doc.data();
        if (c.type != DocumentChangeType.removed && o != null && o['offerTo'] == uid && o['courierUid'] == null) {
          final x = _doc(c.doc);
          final k = _offerKey(x);
          if (_offerSeen.containsKey(k)) continue; // تحديث لنفس العرض: لا نعيد العدّ ولا التنبيه
          _offerSeen[k] = nowMs();
          got = true;
          final d = km(lat ?? asD(me?['lat']), lng ?? asD(me?['lng']), asD(shop(x['shopId'])?['lat']), asD(shop(x['shopId'])?['lng']));
          notify.offer(
            x['id'],
            'طلب جديد قريب منك · ربحك ${money(keeps(x))}',
            '${x['shopName'] ?? ''}${d == null ? '' : ' (${kmText(d)})'} ← ${x['zoneName'] ?? ''}. اضغط لتقبل أو ترفض.',
            const Duration(milliseconds: offerMs),
          );
        }
      }
      if (got) {
        _lastRing = nowMs();
        alert(3);
      }
      notifyListeners();
    }, onError: (_) {}));
  }

  // ---------------- derived ----------------
  int get share => config['share'] != null ? asInt(config['share']) : 0;
  int get cashCap => config['cashCap'] != null ? asInt(config['cashCap']) : 15000;
  int get anyCap => config['anyCap'] != null ? asInt(config['anyCap']) : 3000;

  bool get online => me?['online'] == true;
  int keeps(Doc o) => math.max(0, asInt(o['fee']) - share);
  int platformTakes(Doc o) => math.min(asInt(o['fee']), share);
  int shopDue(Doc o) => isAny(o) ? 0 : math.max(0, asInt(o['subtotal']) - asInt(o['discount']));
  int anyRefund(Doc o) => isAny(o) ? asInt(o['anyPaid']) : 0;

  Doc? shop(dynamic id) => id == null ? null : shops['$id'];

  Doc? order(String id) {
    for (final l in [orders, offers, pool]) {
      for (final o in l) {
        if (o['id'] == id) return o;
      }
    }
    return null;
  }

  /// كم دقيقة بقيت على جاهزية طلب المحل (سالب = تأخر المحل). null إذا لم يبدأ التحضير.
  int? prepLeft(Doc o) {
    if (isAny(o) || o['status'] != 'prep' || o['prepAt'] == null) return null;
    final s = shop(o['shopId']);
    final prep = s != null && asInt(s['prepMin']) > 0 ? asInt(s['prepMin']) : 15;
    return ((asInt(o['prepAt']) + prep * 60000 - nowMs()) / 60000).ceil();
  }

  String prepText(Doc o) {
    final l = prepLeft(o);
    if (l == null) return '';
    if (l > 0) return 'يجهز في المحل خلال ~$l د';
    return 'كان يُفترض أن يجهز الآن · قد تنتظر قليلاً';
  }

  int doneAt(Doc o) => o['doneAt'] != null ? asInt(o['doneAt']) : asInt(o['createdAtMs']);

  List<Doc> get sorted => [...orders]..sort((a, b) => asInt(b['createdAtMs']).compareTo(asInt(a['createdAtMs'])));
  List<Doc> get active => sorted.where((o) => jobStatuses.contains(o['status'])).toList();
  List<Doc> get doneToday {
    final t0 = startOfToday();
    return sorted.where((o) => o['status'] == 'done' && doneAt(o) >= t0).toList();
  }

  /// التوصيلات المكتملة في آخر [historyDays] يوماً، الأحدث أولاً
  List<Doc> get history {
    final t0 = startOfToday() - (historyDays - 1) * 86400000;
    return orders.where((o) => o['status'] == 'done' && doneAt(o) >= t0).toList()
      ..sort((a, b) => doneAt(b).compareTo(doneAt(a)));
  }

  /// ربح كل يوم من آخر [n] أيام، من الأقدم إلى اليوم
  List<({DateTime day, int earned, int count})> lastDays(int n) {
    final now = DateTime.now();
    final days = [for (int i = n - 1; i >= 0; i--) DateTime(now.year, now.month, now.day - i)];
    final earned = List.filled(n, 0), count = List.filled(n, 0);
    for (final o in orders) {
      if (o['status'] != 'done') continue;
      final d = DateTime.fromMillisecondsSinceEpoch(doneAt(o));
      final i = days.indexWhere((x) => x.year == d.year && x.month == d.month && x.day == d.day);
      if (i < 0) continue;
      earned[i] += keeps(o);
      count[i]++;
    }
    return [for (int i = 0; i < n; i++) (day: days[i], earned: earned[i], count: count[i])];
  }

  double? get rating {
    final n = asInt(me?['ratingCount']);
    return n > 0 ? asInt(me?['ratingSum']) / n : null;
  }

  List<Doc> get unsettled => orders.where((o) => o['status'] == 'done' && o['settled'] == false).toList();

  String get block {
    final un = unsettled;
    final cash = un.fold<int>(0, (s, o) => s + asInt(o['total']));
    final t0 = startOfToday();
    if (un.any((o) => doneAt(o) < t0)) return 'لم تُسوَّ حسابات أيام سابقة. سلّم المال للإدارة لتعود إليك الطلبات.';
    if (cash > cashCap) return 'معك ${fmt(cash)} دج، وهذا فوق الحد المسموح (${fmt(cashCap)} دج). سلّم المال للإدارة لتعود إليك الطلبات.';
    return '';
  }

  String _offerKey(Doc o) => '${o['id']}|${o['offerAt'] ?? 0}';
  int offerAge(Doc o) {
    final k = _offerKey(o);
    _offerSeen.putIfAbsent(k, nowMs);
    return nowMs() - _offerSeen[k]!;
  }

  Doc? get currentOffer {
    final uid = user?.uid;
    for (final o in offers) {
      if (o['offerTo'] == uid && o['courierUid'] == null && offerAge(o) < offerMs) return o;
    }
    return null;
  }

  int offerLeft(Doc o) => math.max(0, ((offerMs - offerAge(o)) / 1000).ceil());

  List<({Doc o, double? d})> get poolList {
    if (!online) return [];
    final l = pool.where((o) => o['courierUid'] == null && o['status'] == 'prep').map((o) {
      return (o: o, d: km(lat ?? asD(me?['lat']), lng ?? asD(me?['lng']), asD(o['custLat']), asD(o['custLng'])));
    }).toList();
    l.sort((a, b) => (a.d ?? 99).compareTo(b.d ?? 99));
    return l;
  }

  bool unread(Doc o) => asInt(o['msgN']) > (seen[o['id']] ?? 0) && o['lastMsgBy'] == 'customer';

  void markSeen(String id) {
    final o = order(id);
    if (o == null) return;
    final n = asInt(o['msgN']);
    if ((seen[id] ?? 0) != n) {
      seen[id] = n;
      _saveSeen();
    }
  }

  // ---------------- timers ----------------
  int _tickN = 0;
  void _onTick() {
    _tickN++;
    final cur = currentOffer;
    final has = cur != null;
    // يحدّث «يجهز خلال ~X د» كل 30 ثانية ما دام عندي طلب قيد التحضير
    final prepTick = _tickN % 30 == 0 && orders.any((o) => o['status'] == 'prep');
    if (has || _hadOffer || prepTick) notifyListeners();
    _hadOffer = has;
    final curId = cur?['id'] as String?;
    if (_ringingFor != null && _ringingFor != curId) notify.cancelOffer(_ringingFor!);
    _ringingFor = curId;
    if (has && nowMs() - _lastRing >= ringEveryMs) {
      _lastRing = nowMs();
      alert(1);
    }
    if (_tickN % 4 == 0) _selfCheck();
  }

  // إذا تجاوز الموصّل حد المال أو لم يسوِّ حساب الأمس يصبح غير متصل تلقائياً
  Future<void> _selfCheck() async {
    if (role != 'courier' || !online || !loadedOrders || !loadedConfig || _selfCheckBusy) return;
    final b = block;
    if (b.isEmpty) return;
    _selfCheckBusy = true;
    try {
      await fs.collection('couriers').doc(user!.uid).update({'online': false});
      toast(b);
    } catch (_) {}
    _selfCheckBusy = false;
    stopTracking();
  }

  Future<void> alert(int times) async {
    try {
      await _player.stop();
      await _player.play(AssetSource('alert.wav'));
    } catch (_) {}
    for (int i = 0; i < times; i++) {
      HapticFeedback.heavyImpact();
      await Future.delayed(const Duration(milliseconds: 350));
    }
  }

  // ---------------- live location ----------------
  Future<void> startTracking() async {
    if (_geoSub != null || _beat != null) return;
    _beat = Timer.periodic(const Duration(seconds: 16), (_) => pushLocation(false));
    pushLocation(true);
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        geoErr = 'شغّل GPS في الهاتف. بدون الموقع لا نعرف قربك من المحلات.';
        notifyListeners();
      }
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
      if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
        geoErr = 'رفضت إذن الموقع. اسمح به من إعدادات الهاتف › التطبيقات › Delivery موصّل › الأذونات.';
        notifyListeners();
        return;
      }
      final settings = defaultTargetPlatform == TargetPlatform.android
          ? AndroidSettings(
              accuracy: LocationAccuracy.high,
              distanceFilter: 15,
              intervalDuration: const Duration(seconds: 10),
              foregroundNotificationConfig: const ForegroundNotificationConfig(
                notificationTitle: 'أنت متصل في Delivery',
                notificationText: 'تصلك الطلبات القريبة منك حتى والشاشة مطفأة',
                enableWakeLock: true,
                setOngoing: true,
              ),
            )
          : const LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: 15);
      _geoSub = Geolocator.getPositionStream(locationSettings: settings).listen((p) {
        final moved = (lat == null) || (km(lat, lng, p.latitude, p.longitude) ?? 1) > 0.1;
        lat = double.parse(p.latitude.toStringAsFixed(6));
        lng = double.parse(p.longitude.toStringAsFixed(6));
        if (geoErr.isNotEmpty || moved) {
          geoErr = '';
          notifyListeners(); // تحدّث المسافات المعروضة (مثل «أنت قريب من الزبون»)
        }
        pushLocation(moved);
      }, onError: (e) {
        geoErr = 'تعذّر تحديد الموقع. شغّل GPS ثم أعد المحاولة.';
        notifyListeners();
      });
    } catch (e) {
      geoErr = 'تعذّر تشغيل تحديد الموقع.';
      notifyListeners();
    }
  }

  void stopTracking() {
    _geoSub?.cancel();
    _geoSub = null;
    _beat?.cancel();
    _beat = null;
  }

  void pushLocation(bool force) {
    final c = me;
    if (c == null || c['online'] != true || user == null) return;
    final now = nowMs();
    final busy = orders.any((o) => o['status'] == 'road' || (o['status'] == 'prep' && o['courierUid'] == user!.uid));
    if (!force && now - _lastWrite < (busy ? 15000 : 40000)) return;
    _lastWrite = now;
    final upd = <String, dynamic>{'seenAt': now};
    if (lat != null) {
      upd['lat'] = lat;
      upd['lng'] = lng;
    }
    fs.collection('couriers').doc(user!.uid).update(upd).catchError((_) {});
    if (lat != null) {
      for (final o in orders) {
        if (jobStatuses.contains(o['status'])) {
          fs.collection('orders').doc(o['id']).update({'cLat': lat, 'cLng': lng, 'cAt': now}).catchError((_) {});
        }
      }
    }
  }

  // ---------------- actions ----------------
  Future<void> toggleOnline() async {
    final c = me;
    if (c == null) return;
    final v = !online;
    if (v && block.isNotEmpty) {
      toast(block);
      return;
    }
    final u = <String, dynamic>{'online': v};
    if (v) u['seenAt'] = nowMs();
    try {
      await fs.collection('couriers').doc(user!.uid).update(u);
      toast(v ? 'أنت متصل · ستصلك الطلبات القريبة' : 'أنت غير متصل');
    } catch (e) {
      toast(errText(e));
    }
    if (v) {
      startTracking();
    } else {
      stopTracking();
    }
  }

  Future<bool> accept(String id) async {
    final uid = user!.uid, c = me, ref = fs.collection('orders').doc(id);
    try {
      await fs.runTransaction((t) async {
        final s = await t.get(ref);
        final x = s.data();
        if (x == null || x['offerTo'] != uid || x['courierUid'] != null) throw StateError('gone');
        t.update(ref, {
          'courierUid': uid,
          'courierName': c?['name'] ?? '',
          'courierPhone': c?['phone'] ?? '',
          'offerTo': null,
          'offerAt': null,
          'dispatch': 'assigned',
          'acceptedAt': nowMs(),
          'updatedAt': FieldValue.serverTimestamp(),
        });
      });
      toast('قبلت التوصيل · اذهب إلى المحل');
      pushLocation(true);
      return true;
    } catch (e) {
      toast(errText(e));
      notifyListeners();
      return false;
    }
  }

  Future<void> decline(String id) async {
    try {
      await queued(fs.collection('orders').doc(id).update({
        'offerTo': null,
        'offerAt': null,
        'declined': FieldValue.arrayUnion([user!.uid]),
      }));
      toast('رفضت العرض');
    } catch (e) {
      toast(errText(e));
    }
  }

  Future<bool> take(String id) async {
    if (block.isNotEmpty) {
      toast(block);
      return false;
    }
    final uid = user!.uid, c = me, ref = fs.collection('orders').doc(id);
    try {
      await fs.runTransaction((t) async {
        final s = await t.get(ref);
        final x = s.data();
        if (x == null || x['courierUid'] != null || x['status'] != 'prep') throw StateError('gone');
        t.update(ref, {
          'courierUid': uid,
          'courierName': c?['name'] ?? '',
          'courierPhone': c?['phone'] ?? '',
          'dispatch': 'assigned',
          'acceptedAt': nowMs(),
          'updatedAt': FieldValue.serverTimestamp(),
        });
      });
      toast('الطلب لك · اشترِه ثم اكتب المبلغ');
      pushLocation(true);
      return true;
    } catch (e) {
      toast(errText(e));
      return false;
    }
  }

  Future<bool> setStatus(String id, String status, String okMsg, [Map<String, dynamic>? extra]) async {
    final u = <String, dynamic>{'status': status, 'updatedAt': FieldValue.serverTimestamp(), ...?extra};
    try {
      final sent = await queued(fs.collection('orders').doc(id).update(u));
      toast(sent ? okMsg : '$okMsg · $pendingNote');
      return true;
    } catch (e) {
      toast(errText(e));
      return false;
    }
  }

  Future<bool> pick(String id) => setStatus(id, 'road', 'في الطريق إلى الزبون', {'pickedAt': nowMs()});
  Future<bool> done(String id) async {
    _doneByMe.add(id);
    final ok = await setStatus(id, 'done', 'سُجّل التسليم · أُضيف المبلغ إلى حصيلتك', {'doneAt': nowMs()});
    if (!ok) _doneByMe.remove(id);
    return ok;
  }

  /// يرجع رسالة خطأ أو '' إذا نجح
  Future<String> paid(Doc o, String amtText) async {
    final amt = parseInt(amtText);
    if (amt == null || amt <= 0) return 'اكتب المبلغ بالدينار.';
    if (amt > anyCap * 1.5) return 'المبلغ أكبر بكثير من الحد (${fmt(anyCap)} دج). راجع الإدارة.';
    await setStatus(o['id'], 'road', 'في الطريق · يرى الزبون المبلغ الآن',
        {'anyPaid': amt, 'subtotal': amt, 'total': amt + asInt(o['fee']), 'pickedAt': nowMs()});
    return '';
  }

  Future<void> sendMsg(String orderId, String text) async {
    final t = text.trim();
    if (t.isEmpty) return;
    final msg = t.length > 400 ? t.substring(0, 400) : t;
    final ref = fs.collection('orders').doc(orderId);
    final b = fs.batch();
    b.set(ref.collection('messages').doc(), {
      'by': 'courier',
      'uid': user!.uid,
      'text': msg,
      'atMs': nowMs(),
      'at': FieldValue.serverTimestamp(),
    });
    b.update(ref, {
      'msgN': FieldValue.increment(1),
      'lastMsgBy': 'courier',
      'lastMsgText': msg.length > 80 ? msg.substring(0, 80) : msg,
    });
    if (!await queued(b.commit())) toast('الرسالة $pendingNote');
  }
}
