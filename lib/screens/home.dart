import 'package:flutter/material.dart';

import '../store.dart';
import '../ui.dart';
import 'job.dart';

class TopHero extends StatelessWidget {
  final String sub;
  final List<Widget> children;
  final Widget? trailing;
  const TopHero({super.key, required this.sub, required this.children, this.trailing});

  @override
  Widget build(BuildContext context) {
    final c = app.me ?? {};
    return Container(
      decoration: const BoxDecoration(
        gradient: courierGradient,
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(28)),
      ),
      padding: EdgeInsets.fromLTRB(18, MediaQuery.of(context).padding.top + 14, 18, 18),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(sub, style: const TextStyle(color: Colors.white70, fontSize: 13)),
              Text('${c['name'] ?? ''}', style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800)),
            ]),
          ),
          if (trailing != null) trailing!,
          IconButton(
            tooltip: 'الخروج',
            onPressed: () async {
              if (await confirm(context, 'تسجيل الخروج', 'ستصبح غير متصل ولن تصلك الطلبات.', 'خروج')) app.logout();
            },
            icon: const Icon(Icons.logout_rounded, color: Colors.white),
          ),
        ]),
        ...children,
      ]),
    );
  }
}

class Stat extends StatelessWidget {
  final String label, value;
  const Stat(this.label, this.value, {super.key});

  @override
  Widget build(BuildContext context) => Expanded(
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(16)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: const TextStyle(color: Colors.white70, fontSize: 12)),
            const SizedBox(height: 2),
            Text(value, style: const TextStyle(color: Colors.white, fontSize: 19, fontWeight: FontWeight.w800)),
          ]),
        ),
      );
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  void _open(BuildContext context, String id) =>
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => JobScreen(orderId: id)));

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: app,
      builder: (context, _) {
        if (app.me == null) return const Center(child: CircularProgressIndicator());
        final block = app.block;
        final on = app.online && block.isEmpty;
        final today = app.doneToday;
        final active = app.active;
        final pool = app.poolList;
        final hint = Theme.of(context).hintColor;
        return ListView(padding: EdgeInsets.zero, children: [
          TopHero(
            sub: 'مرحباً',
            trailing: Transform.scale(
              scale: 1.15,
              child: Switch(
                value: on,
                activeThumbColor: Colors.white,
                activeTrackColor: const Color(0xFF3DBB8C),
                onChanged: block.isNotEmpty ? null : (_) => app.toggleOnline(),
              ),
            ),
            children: [
              const SizedBox(height: 10),
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(20)),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Icon(Icons.circle, size: 10, color: on ? const Color(0xFF5EE0A8) : Colors.white54),
                    const SizedBox(width: 6),
                    Text(on ? 'متصل · تصلك الطلبات القريبة منك' : 'غير متصل · لا تصلك طلبات',
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 13)),
                  ]),
                ),
              ),
              const SizedBox(height: 14),
              Row(children: [
                Stat('توصيلات اليوم', '${today.length}'),
                const SizedBox(width: 10),
                Stat('ربحك اليوم', money(today.fold<int>(0, (s, o) => s + app.keeps(o)))),
              ]),
            ],
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              if (block.isNotEmpty)
                Note(block, color: warn, icon: Icons.warning_amber_rounded)
              else if (on && app.geoErr.isNotEmpty)
                Note(app.geoErr, color: warn, icon: Icons.location_off_rounded)
              else if (on)
                const Note('يمكنك إطفاء الشاشة، ستصلك الطلبات مع صوت تنبيه. لا تغلق التطبيق من قائمة التطبيقات المفتوحة.'),
              if (pool.isNotEmpty) ...[
                const SizedBox(height: 18),
                Text('طلبات «اشترِ لي» تنتظر موصّلاً', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 8),
                for (final x in pool) _PoolCard(o: x.o, d: x.d),
              ],
              const SizedBox(height: 18),
              Text('توصيلاتي الجارية', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              if (!app.loadedOrders)
                const Padding(padding: EdgeInsets.all(30), child: Center(child: CircularProgressIndicator()))
              else if (active.isEmpty)
                EmptyState(
                  icon: Icons.delivery_dining_rounded,
                  title: on ? 'لا توجد توصيلات جارية' : 'أنت غير متصل',
                  text: on
                      ? 'عندما يقبل محل قريب طلباً يظهر لك عرض مع تنبيه.'
                      : 'شغّل المفتاح في الأعلى لتبدأ استقبال الطلبات.',
                )
              else
                for (final o in active)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Box(
                      onTap: () => _open(context, o['id']),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                        Row(children: [
                          if (isAny(o)) ...[anyPill, const SizedBox(width: 6)],
                          Expanded(
                            child: Text(
                              '${isAny(o) ? ((o['anyFrom'] ?? '').toString().isEmpty ? 'أي محل' : o['anyFrom']) : o['shopName']} ← ${o['zoneName'] ?? ''}',
                              style: const TextStyle(fontWeight: FontWeight.w700),
                            ),
                          ),
                          statusPill(o),
                        ]),
                        const SizedBox(height: 6),
                        Text(isAny(o) ? '${o['anyText'] ?? ''}' : itemsText(o),
                            maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(color: hint)),
                        if (app.unread(o))
                          const Padding(
                            padding: EdgeInsets.only(top: 6),
                            child: Row(children: [
                              Icon(Icons.chat_rounded, size: 16, color: orange),
                              SizedBox(width: 4),
                              Text('رسالة جديدة من الزبون', style: TextStyle(color: orange, fontWeight: FontWeight.w700)),
                            ]),
                          ),
                        const SizedBox(height: 6),
                        Row(children: [
                          Expanded(child: Text('طلب ${o['no'] ?? ''} · يحصّل من الزبون', style: TextStyle(color: hint, fontSize: 13))),
                          Text(money(asInt(o['total'])) + (isAny(o) && o['anyPaid'] == null ? ' تقريباً' : ''),
                              style: const TextStyle(fontWeight: FontWeight.w800)),
                        ]),
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

class _PoolCard extends StatefulWidget {
  final Doc o;
  final double? d;
  const _PoolCard({required this.o, required this.d});
  @override
  State<_PoolCard> createState() => _PoolCardState();
}

class _PoolCardState extends State<_PoolCard> {
  bool busy = false;

  @override
  Widget build(BuildContext context) {
    final o = widget.o;
    final from = (o['anyFrom'] ?? '').toString();
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Box(
        border: Border.all(color: orange.withValues(alpha: 0.5), width: 1.5),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Expanded(
              child: Text('${from.isEmpty ? 'أي محل قريب' : from} ← ${o['zoneName'] ?? ''}',
                  style: const TextStyle(fontWeight: FontWeight.w700)),
            ),
            if (widget.d != null) Pill(kmText(widget.d)),
          ]),
          const SizedBox(height: 6),
          Text('${o['anyText'] ?? ''}'),
          const SizedBox(height: 8),
          Line('تدفع من مالك تقريباً', money(asInt(o['anyBudget']))),
          Line('ربحك من التوصيلة', money(app.keeps(o)), color: brand),
          const SizedBox(height: 8),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: orange),
            onPressed: busy
                ? null
                : () async {
                    setState(() => busy = true);
                    final ok = await app.take(o['id']);
                    if (mounted) setState(() => busy = false);
                    if (ok && context.mounted) {
                      Navigator.of(context).push(MaterialPageRoute(builder: (_) => JobScreen(orderId: o['id'])));
                    }
                  },
            child: const Text('أقبل هذا الطلب'),
          ),
        ]),
      ),
    );
  }
}
