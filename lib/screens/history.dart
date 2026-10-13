import 'package:flutter/material.dart';

import '../store.dart';
import '../ui.dart';
import 'home.dart';

const _weekday = ['الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];
const _weekdayShort = ['إثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت', 'أحد'];

String dayTitle(DateTime d) {
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final diff = today.difference(DateTime(d.year, d.month, d.day)).inDays;
  if (diff == 0) return 'اليوم';
  if (diff == 1) return 'أمس';
  return '${_weekday[d.weekday - 1]} ${d.day}/${d.month}';
}

class HistoryScreen extends StatelessWidget {
  const HistoryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: app,
      builder: (context, _) {
        if (app.me == null) return const Center(child: CircularProgressIndicator());
        final week = app.lastDays(7);
        final weekEarned = week.fold<int>(0, (s, d) => s + d.earned);
        final weekCount = week.fold<int>(0, (s, d) => s + d.count);
        final hint = Theme.of(context).hintColor;

        // تجميع التوصيلات حسب اليوم (القائمة مرتبة من الأحدث)
        final groups = <DateTime, List<Doc>>{};
        for (final o in app.history) {
          final t = DateTime.fromMillisecondsSinceEpoch(app.doneAt(o));
          groups.putIfAbsent(DateTime(t.year, t.month, t.day), () => []).add(o);
        }

        return ListView(padding: EdgeInsets.zero, children: [
          TopHero(sub: 'السجل', children: [
            const SizedBox(height: 14),
            Row(children: [
              Stat('ربحك في 7 أيام', money(weekEarned)),
              const SizedBox(width: 10),
              Stat('توصيلات 7 أيام', '$weekCount'),
            ]),
          ]),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Box(child: WeekChart(days: week)),
              const SizedBox(height: 18),
              Text('توصيلاتي في آخر $historyDays يوماً', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              if (!app.loadedOrders)
                const Padding(padding: EdgeInsets.all(30), child: Center(child: CircularProgressIndicator()))
              else if (groups.isEmpty)
                const EmptyState(
                  icon: Icons.history_rounded,
                  title: 'لا توجد توصيلات مكتملة بعد',
                  text: 'كل توصيلة تسلّمها تظهر هنا مع ربحك منها.',
                )
              else
                for (final e in groups.entries) ...[
                  Padding(
                    padding: const EdgeInsets.fromLTRB(4, 10, 4, 6),
                    child: Row(children: [
                      Expanded(
                        child: Text(dayTitle(e.key), style: const TextStyle(fontWeight: FontWeight.w700)),
                      ),
                      Text('${deliveries(e.value.length)} · ${money(e.value.fold<int>(0, (s, o) => s + app.keeps(o)))}',
                          style: TextStyle(color: hint, fontSize: 13)),
                    ]),
                  ),
                  for (final o in e.value) _HistoryRow(o: o),
                ],
            ]),
          ),
        ]);
      },
    );
  }
}

class _HistoryRow extends StatelessWidget {
  final Doc o;
  const _HistoryRow({required this.o});

  @override
  Widget build(BuildContext context) {
    final hint = Theme.of(context).hintColor;
    final stars = o['stars'] is Map ? asInt((o['stars'] as Map)['courier']) : 0;
    final settled = o['settled'] != false;
    final from = isAny(o) ? 'اشترِ لي' : '${o['shopName'] ?? ''}';
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Box(
        padding: const EdgeInsets.all(12),
        child: Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('$from ← ${o['zoneName'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 2),
              Text('${clock(app.doneAt(o))} · طلب ${o['no'] ?? ''} · حصّلت ${money(asInt(o['total']))}',
                  style: TextStyle(color: hint, fontSize: 12)),
              const SizedBox(height: 6),
              Wrap(spacing: 6, runSpacing: 4, children: [
                settled
                    ? const Pill('سُوّي الحساب', bg: Color(0xFFE2F1EA), fg: Color(0xFF0A5A41), icon: Icons.check_rounded)
                    : const Pill('لم يُسوَّ بعد', bg: Color(0xFFFFF1DC), fg: Color(0xFF8A4B00), icon: Icons.schedule_rounded),
                if (stars > 0) Pill('$stars من 5', icon: Icons.star_rounded),
              ]),
            ]),
          ),
          const SizedBox(width: 8),
          Text('+${money(app.keeps(o))}', style: const TextStyle(fontWeight: FontWeight.w800)),
        ]),
      ),
    );
  }
}

/// أعمدة ربح آخر 7 أيام. اضغط على عمود لترى مبلغه.
class WeekChart extends StatefulWidget {
  final List<({DateTime day, int earned, int count})> days;
  const WeekChart({super.key, required this.days});
  @override
  State<WeekChart> createState() => _WeekChartState();
}

class _WeekChartState extends State<WeekChart> {
  int? picked; // null = اليوم

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dark = theme.brightness == Brightness.dark;
    final bar = dark ? const Color(0xFF5F95DA) : const Color(0xFF2B66AE);
    final hint = theme.hintColor;
    final days = widget.days;
    final sel = (picked ?? days.length - 1).clamp(0, days.length - 1);
    final top = days.fold<int>(0, (m, d) => d.earned > m ? d.earned : m);
    final d = days[sel];
    const plotH = 110.0;

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text('ربحك في آخر 7 أيام', style: theme.textTheme.titleMedium),
      const SizedBox(height: 2),
      Text('${dayTitle(d.day)}: ${money(d.earned)} · ${deliveries(d.count)}',
          style: TextStyle(color: hint, fontSize: 13)),
      const SizedBox(height: 14),
      SizedBox(
        height: plotH + 30,
        child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
          for (int i = 0; i < days.length; i++)
            Expanded(
              child: Semantics(
                button: true,
                label: '${dayTitle(days[i].day)}: ${money(days[i].earned)}',
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => setState(() => picked = i),
                  child: Column(mainAxisAlignment: MainAxisAlignment.end, children: [
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 5),
                      child: Container(
                        height: top == 0 ? 0 : (plotH * days[i].earned / top).clamp(days[i].earned > 0 ? 4.0 : 0.0, plotH),
                        decoration: BoxDecoration(
                          color: bar.withValues(alpha: i == sel ? 1 : 0.55),
                          borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
                        ),
                      ),
                    ),
                    Container(height: 1, color: theme.dividerColor),
                    const SizedBox(height: 4),
                    Text(
                      i == days.length - 1 ? 'اليوم' : _weekdayShort[days[i].day.weekday - 1],
                      style: TextStyle(
                        fontSize: 11,
                        color: i == sel ? theme.colorScheme.onSurface : hint,
                        fontWeight: i == sel ? FontWeight.w700 : FontWeight.w400,
                      ),
                    ),
                  ]),
                ),
              ),
            ),
        ]),
      ),
      if (top == 0)
        Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Text('لا ربح مسجّل في هذه الأيام.', style: TextStyle(color: hint, fontSize: 12)),
        ),
    ]);
  }
}
