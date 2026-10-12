import 'package:flutter/material.dart';

import '../store.dart';
import '../ui.dart';
import 'home.dart';

class EarnScreen extends StatelessWidget {
  const EarnScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: app,
      builder: (context, _) {
        final c = app.me;
        if (c == null) return const Center(child: CircularProgressIndicator());
        final today = app.doneToday;
        final un = app.unsettled;
        final byShop = <String, int>{};
        for (final o in un) {
          if (!isAny(o)) byShop['${o['shopName'] ?? ''}'] = (byShop['${o['shopName'] ?? ''}'] ?? 0) + app.shopDue(o);
        }
        int sum(int Function(Doc) f) => un.fold<int>(0, (s, o) => s + f(o));
        final cash = sum((o) => asInt(o['total']));
        final toPlat = sum(app.platformTakes);
        final keep = sum(app.keeps);
        final refund = sum(app.anyRefund);
        final hint = Theme.of(context).hintColor;
        final rc = asInt(c['ratingCount']);
        final over = cash > app.cashCap;

        return ListView(padding: EdgeInsets.zero, children: [
          TopHero(sub: 'حصيلتي', children: [
            const SizedBox(height: 14),
            Row(children: [
              Stat('ربحك اليوم', money(today.fold<int>(0, (s, o) => s + app.keeps(o)))),
              const SizedBox(width: 10),
              Stat('توصيلات اليوم', '${today.length}'),
            ]),
          ]),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Box(
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Text('المال الذي معك (لم يُسوَّ بعد)', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 10),
                  Line('حصّلته من الزبائن (${un.length} طلبات)', money(cash), bold: true, color: over ? Colors.red : null),
                  const SizedBox(height: 4),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(6),
                    child: LinearProgressIndicator(
                      value: app.cashCap > 0 ? (cash / app.cashCap).clamp(0, 1).toDouble() : 0,
                      minHeight: 8,
                      color: over ? Colors.red : (cash > app.cashCap * 0.8 ? orange : info),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text('الحد المسموح ${money(app.cashCap)}', style: TextStyle(color: hint, fontSize: 12)),
                  const Divider(height: 22),
                  for (final e in byShop.entries) Line('تسلّمه لـ ${e.key}', money(e.value)),
                  Line('تسلّمه للمنصة', money(toPlat)),
                  if (refund > 0) Line('تسترجع ما دفعته في «اشترِ لي»', money(refund)),
                  const Divider(),
                  Line('يبقى لك (ربحك)', money(keep), bold: true, color: brand),
                  if (rc > 0) ...[
                    const SizedBox(height: 8),
                    Row(children: [
                      Text('تقييمك عند الزبائن: ', style: TextStyle(color: hint)),
                      const Icon(Icons.star_rounded, color: star, size: 18),
                      Text((asInt(c['ratingSum']) / rc).toStringAsFixed(1), style: const TextStyle(fontWeight: FontWeight.w800)),
                      Text(' ($rc)', style: TextStyle(color: hint)),
                    ]),
                  ],
                  const SizedBox(height: 8),
                  Text('التسوية مع الإدارة في آخر كل يوم.', style: TextStyle(color: hint, fontSize: 12)),
                ]),
              ),
              const SizedBox(height: 18),
              Text('توصيلات اليوم', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              if (today.isEmpty)
                Text('لا توجد توصيلات مكتملة اليوم.', style: TextStyle(color: hint))
              else
                for (final o in today)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Box(
                      padding: const EdgeInsets.all(12),
                      child: Row(children: [
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text('${isAny(o) ? 'اشترِ لي' : o['shopName']} ← ${o['zoneName'] ?? ''}',
                                style: const TextStyle(fontWeight: FontWeight.w600)),
                            Text('${clock(app.doneAt(o))} · طلب ${o['no'] ?? ''}', style: TextStyle(color: hint, fontSize: 12)),
                          ]),
                        ),
                        Text('+${money(app.keeps(o))}', style: const TextStyle(color: info, fontWeight: FontWeight.w800)),
                      ]),
                    ),
                  ),
            ]),
          ),
        ]);
      },
    );
  }
}
