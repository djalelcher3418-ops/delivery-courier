import 'package:flutter/material.dart';

import '../store.dart';
import '../ui.dart';
import 'job.dart';

/// نافذة «طلب جديد قريب منك» مع العدّ التنازلي — تظهر فوق كل الصفحات
class OfferOverlay extends StatefulWidget {
  final Doc offer;
  final GlobalKey<NavigatorState> navKey;
  const OfferOverlay({super.key, required this.offer, required this.navKey});
  @override
  State<OfferOverlay> createState() => _OfferOverlayState();
}

class _OfferOverlayState extends State<OfferOverlay> {
  bool busy = false;

  Future<void> _accept() async {
    setState(() => busy = true);
    final id = widget.offer['id'] as String;
    final ok = await app.accept(id);
    if (mounted) setState(() => busy = false);
    if (ok) {
      final nav = widget.navKey.currentState;
      nav?.popUntil((r) => r.isFirst);
      nav?.push(MaterialPageRoute(builder: (_) => JobScreen(orderId: id)));
    }
  }

  Future<void> _decline() async {
    setState(() => busy = true);
    await app.decline(widget.offer['id']);
    if (mounted) setState(() => busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final o = widget.offer;
    final s = app.shop(o['shopId']);
    final d = km(app.lat ?? asD(app.me?['lat']), app.lng ?? asD(app.me?['lng']), asD(s?['lat']), asD(s?['lng']));
    final left = app.offerLeft(o);
    final theme = Theme.of(context);
    return Material(
      color: Colors.black54,
      child: SafeArea(
        child: Align(
          alignment: Alignment.bottomCenter,
          child: Container(
            margin: const EdgeInsets.all(12),
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(color: theme.colorScheme.surface, borderRadius: BorderRadius.circular(28)),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                const Pill('طلب جديد قريب منك', bg: harissaSoft, fg: harissaDark, icon: Icons.notifications_active_rounded),
                const Spacer(),
                Semantics(
                  label: 'بقيت $left ثانية',
                  excludeSemantics: true,
                  child: SizedBox(
                    width: 50,
                    height: 50,
                    child: Stack(alignment: Alignment.center, children: [
                      CircularProgressIndicator(
                        value: left / (offerMs / 1000),
                        strokeWidth: 4,
                        color: left <= 15 ? danger : harissa,
                        backgroundColor: isDark(context) ? Colors.white12 : harissaSoft,
                      ),
                      Text('$left', style: theme.textTheme.titleMedium?.copyWith(fontSize: 17, height: 1)),
                    ]),
                  ),
                ),
              ]),
              const SizedBox(height: 10),
              Text('${o['shopName'] ?? ''}', style: theme.textTheme.headlineSmall?.copyWith(fontSize: 25, height: 1.2)),
              const SizedBox(height: 6),
              Wrap(spacing: 14, runSpacing: 4, children: [
                if (d != null) Meta(Icons.place_outlined, 'المحل على بعد ${kmText(d)}'),
                Meta(Icons.home_outlined, 'التسليم إلى ${o['zoneName'] ?? ''}'),
                if (app.prepText(o).isNotEmpty) Meta(Icons.schedule_rounded, app.prepText(o)),
              ]),
              const SizedBox(height: 8),
              Text(itemsText(o), style: TextStyle(color: theme.hintColor), maxLines: 3, overflow: TextOverflow.ellipsis),
              const Divider(height: 22),
              Line('ربحك من التوصيلة', money(app.keeps(o)), bold: true, color: teaOf(context)),
              Line('تحصّل من الزبون', money(asInt(o['total']))),
              const SizedBox(height: 6),
              Text('إذا لم ترد خلال $left ثانية يُعرض على موصّل آخر.',
                  style: TextStyle(fontSize: 12, color: theme.hintColor), textAlign: TextAlign.center),
              const SizedBox(height: 12),
              Row(children: [
                Expanded(
                  child: OutlinedButton(
                    style: OutlinedButton.styleFrom(minimumSize: const Size(0, 56)),
                    onPressed: busy ? null : _decline,
                    child: const Text('رفض'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  flex: 2,
                  child: FilledButton(
                    style: FilledButton.styleFrom(minimumSize: const Size(0, 56), backgroundColor: harissa),
                    onPressed: busy ? null : _accept,
                    child: const Text('قبول التوصيل', style: TextStyle(fontSize: 17)),
                  ),
                ),
              ]),
            ]),
          ),
        ),
      ),
    );
  }
}
