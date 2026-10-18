import 'package:flutter/material.dart';

import '../store.dart';
import '../ui.dart';
import 'chat.dart';

class JobScreen extends StatefulWidget {
  final String orderId;
  const JobScreen({super.key, required this.orderId});
  @override
  State<JobScreen> createState() => _JobScreenState();
}

class _JobScreenState extends State<JobScreen> {
  bool busy = false;
  final Set<String> _toldArrived = {};

  Future<void> _tellArrived(String id) async {
    setState(() => _toldArrived.add(id));
    try {
      await app.sendMsg(id, 'وصلت، أنا أمام العنوان');
      app.toast('أُبلغ الزبون أنك وصلت');
    } catch (e) {
      setState(() => _toldArrived.remove(id));
      app.toast(errText(e));
    }
  }

  Future<void> _run(Future<bool> Function() f, {bool back = false}) async {
    setState(() => busy = true);
    final ok = await f();
    if (mounted) setState(() => busy = false);
    if (ok && back && mounted) Navigator.of(context).pop();
  }

  Future<void> _paid(Doc o) async {
    final ctl = TextEditingController();
    String err = '';
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (c) => StatefulBuilder(
        builder: (c, setS) => Padding(
          padding: EdgeInsets.fromLTRB(18, 0, 18, MediaQuery.of(c).viewInsets.bottom + 18),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('كم دفعت في المشتريات؟', style: Theme.of(c).textTheme.titleLarge),
            const SizedBox(height: 4),
            Text('اكتب المبلغ المكتوب في الوصل بالضبط. يراه الزبون ويُضاف إليه ثمن التوصيل.',
                style: TextStyle(color: Theme.of(c).hintColor)),
            const SizedBox(height: 14),
            TextField(
              controller: ctl,
              autofocus: true,
              keyboardType: TextInputType.number,
              textDirection: TextDirection.ltr,
              decoration: InputDecoration(labelText: 'المبلغ', suffixText: 'دج', errorText: err.isEmpty ? null : err),
            ),
            const SizedBox(height: 14),
            FilledButton(
              onPressed: () async {
                final e = await app.paid(o, ctl.text);
                if (e.isNotEmpty) {
                  setS(() => err = e);
                  return;
                }
                if (c.mounted) Navigator.pop(c);
              },
              child: const Text('حفظ والانطلاق إلى الزبون'),
            ),
          ]),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: app,
      builder: (context, _) {
        final o = app.order(widget.orderId);
        if (o == null || o['courierUid'] != app.user?.uid) {
          return Scaffold(
            appBar: AppBar(),
            body: app.loadedOrders
                ? const EmptyState(icon: Icons.search_off_rounded, title: 'لم يعد هذا الطلب عندك')
                : const Center(child: CircularProgressIndicator()),
          );
        }
        final any = isAny(o);
        final st = '${o['status']}';
        final s = app.shop(o['shopId']);
        final hint = Theme.of(context).hintColor;
        final cLat = asD(o['custLat']), cLng = asD(o['custLng']);
        final toCust = km(app.lat, app.lng, cLat, cLng);
        final atCustomer = toCust != null && toCust <= 0.2;
        final sLat = asD(s?['lat']), sLng = asD(s?['lng']);
        final from = '${o['anyFrom'] ?? ''}';

        Widget action;
        if (st == 'prep' && any) {
          action = FilledButton.icon(
            onPressed: busy ? null : () => _paid(o),
            icon: const Icon(Icons.receipt_long_rounded),
            label: const Text('اشتريت الطلب، اكتب المبلغ'),
          );
        } else if (st == 'prep' || st == 'ready') {
          action = FilledButton.icon(
            onPressed: busy
                ? null
                : () async {
                    if (await confirm(context, 'استلمت الطلب؟', 'تأكد أن كل المنتجات معك قبل المغادرة.', 'نعم، استلمته')) {
                      _run(() => app.pick(o['id']));
                    }
                  },
            icon: const Icon(Icons.inventory_2_rounded),
            label: const Text('استلمت الطلب من المحل'),
          );
        } else if (st == 'road') {
          action = FilledButton.icon(
            style: FilledButton.styleFrom(backgroundColor: tea),
            onPressed: busy
                ? null
                : () async {
                    if (await confirm(context, 'تم التسليم؟', 'سلّمت الطلب وحصّلت ${money(asInt(o['total']))} من الزبون.', 'نعم')) {
                      _run(() => app.done(o['id']), back: true);
                    }
                  },
            icon: const Icon(Icons.check_circle_rounded),
            label: Text('سلّمت الطلب وحصّلت ${money(asInt(o['total']))}'),
          );
        } else if (st == 'done') {
          action = Note('تم التسليم الساعة ${clock(app.doneAt(o))}، وحصّلت ${money(asInt(o['total']))}',
              color: tea, icon: Icons.check_circle_rounded);
        } else {
          action = Note('أُلغي هذا الطلب. لا تشترِ ولا تسلّم شيئاً، ولا تحصّل أي مبلغ.',
              color: danger, icon: Icons.cancel_rounded);
        }

        final pickupActive = st == 'prep' || st == 'ready';
        return Scaffold(
          appBar: AppBar(
            title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${any ? 'اشترِ لي، ' : ''}طلب ${o['no'] ?? ''}'),
              const SizedBox(height: 2),
              statusPill(o),
            ]),
            toolbarHeight: 70,
          ),
          body: ListView(padding: const EdgeInsets.fromLTRB(16, 6, 16, 120), children: [
            if (st == 'road' && atCustomer && !_toldArrived.contains(o['id'])) ...[
              Box(
                color: brand.withValues(alpha: isDark(context) ? 0.25 : 0.09),
                child: Row(children: [
                  Icon(Icons.where_to_vote_rounded, color: accentOf(context)),
                  const SizedBox(width: 10),
                  const Expanded(child: Text('أنت قريب من عنوان الزبون.', style: TextStyle(fontWeight: FontWeight.w600))),
                  FilledButton(
                    style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
                    onPressed: () => _tellArrived(o['id']),
                    child: const Text('أبلغه أنني وصلت'),
                  ),
                ]),
              ),
              const SizedBox(height: 12),
            ],
            if (st == 'prep' && !any)
              Note(
                app.prepText(o).isEmpty ? 'المحل يحضّر الطلب. اذهب إليه الآن.' : 'المحل يحضّر الطلب. ${app.prepText(o)}.',
                color: saffronText,
                icon: Icons.storefront_rounded,
              ),
            if (st == 'ready') const Note('الطلب جاهز في المحل، استلمه الآن.', color: tea, icon: Icons.task_alt_rounded),
            if (st == 'prep' && any)
              const Note('اشترِ الطلب واحتفظ بالوصل أو صوّره، ثم اكتب المبلغ الذي دفعته بالضبط.',
                  color: saffronText, icon: Icons.shopping_bag_rounded),
            const SizedBox(height: 12),
            // ١: الاستلام
            Box(
              border: pickupActive ? Border.all(color: accentOf(context), width: 2) : null,
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Row(children: [
                  StepStar('1', active: pickupActive),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(any ? 'اشترِ من' : 'الاستلام من', style: TextStyle(color: hint, fontSize: 12, fontWeight: FontWeight.w700)),
                      Text(any ? (from.isEmpty ? 'أي محل قريب من الزبون' : from) : '${o['shopName'] ?? ''}',
                          style: Theme.of(context).textTheme.titleMedium?.copyWith(fontSize: 19)),
                    ]),
                  ),
                ]),
                const SizedBox(height: 8),
                if (any) ...[
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(color: isDark(context) ? star.withValues(alpha: 0.14) : saffronSoft, borderRadius: BorderRadius.circular(12)),
                    child: Text('${o['anyText'] ?? ''}', style: const TextStyle(height: 1.5)),
                  ),
                  const SizedBox(height: 6),
                  Line('ميزانية الزبون التقديرية', money(asInt(o['anyBudget']))),
                  Text('إذا لم تجد شيئاً أو كان السعر أعلى بكثير، راسل الزبون قبل الشراء.',
                      style: TextStyle(color: hint, fontSize: 12)),
                ] else ...[
                  for (final i in itemsOf(o))
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 2),
                      child: Text.rich(TextSpan(children: [
                        TextSpan(text: '${i['name'] ?? ''}'),
                        TextSpan(text: ' × ${asInt(i['qty'])}', style: const TextStyle(fontWeight: FontWeight.w800)),
                        if (optsText(i).isNotEmpty) TextSpan(text: '  (${optsText(i)})', style: TextStyle(color: hint)),
                      ])),
                    ),
                  if ('${o['note'] ?? ''}'.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Note('ملاحظة: ${o['note']}', color: saffronText, icon: Icons.sticky_note_2_rounded),
                  ],
                  const SizedBox(height: 10),
                  Row(children: [
                    if ('${s?['phone'] ?? ''}'.isNotEmpty)
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () => callPhone('${s!['phone']}'),
                          icon: const Icon(Icons.call_rounded),
                          label: const Text('اتصل بالمحل'),
                        ),
                      ),
                    if ('${s?['phone'] ?? ''}'.isNotEmpty && sLat != null) const SizedBox(width: 8),
                    if (sLat != null)
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () => openMaps(sLat, sLng!),
                          icon: const Icon(Icons.navigation_rounded),
                          label: const Text('الطريق للمحل'),
                        ),
                      ),
                  ]),
                  if (sLat == null) Text('لم يحدد المحل موقعه على الخريطة.', style: TextStyle(color: hint, fontSize: 12)),
                ],
              ]),
            ),
            const SizedBox(height: 12),
            // ٢: التسليم
            Box(
              border: st == 'road' ? Border.all(color: accentOf(context), width: 2) : null,
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Row(children: [
                  StepStar('2', active: st == 'road'),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('التسليم إلى', style: TextStyle(color: hint, fontSize: 12, fontWeight: FontWeight.w700)),
                      Text('${(o['customerName'] ?? '').toString().isEmpty ? 'الزبون' : o['customerName']}',
                          style: Theme.of(context).textTheme.titleMedium?.copyWith(fontSize: 19)),
                    ]),
                  ),
                ]),
                const SizedBox(height: 8),
                Meta(Icons.place_outlined, '${o['zoneName'] ?? ''}${'${o['address'] ?? ''}'.isEmpty ? '' : '، ${o['address']}'}',
                    color: Theme.of(context).colorScheme.onSurface),
                Text('${o['phone'] ?? ''}', textDirection: TextDirection.ltr, textAlign: TextAlign.right, style: TextStyle(color: hint)),
                const SizedBox(height: 10),
                Row(children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => callPhone('${o['phone'] ?? ''}'),
                      icon: const Icon(Icons.call_rounded),
                      label: const Text('اتصل'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => ChatScreen(orderId: o['id']))),
                      icon: Badge(isLabelVisible: app.unread(o), smallSize: 9, child: const Icon(Icons.chat_rounded)),
                      label: const Text('راسل'),
                    ),
                  ),
                  if (cLat != null) ...[
                    const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => openMaps(cLat, cLng!),
                        icon: const Icon(Icons.navigation_rounded),
                        label: const Text('الطريق'),
                      ),
                    ),
                  ],
                ]),
                if (cLat == null)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text('لم يرسل الزبون موقعه، اتصل به عند الوصول إلى الحي.', style: TextStyle(color: hint, fontSize: 12)),
                  ),
              ]),
            ),
            const SizedBox(height: 12),
            // الحساب
            Box(
              child: Column(children: [
                if (any) ...[
                  Line(o['anyPaid'] != null ? 'دفعت في المشتريات' : 'المشتريات (تقديري)',
                      money(asInt(o['anyPaid'] ?? o['anyBudget']))),
                  Line('التوصيل', money(asInt(o['fee']))),
                ] else ...[
                  Line('منها للمحل', money(app.shopDue(o))),
                  if (asInt(o['discount']) > 0) Line('خصم كوبون (على حساب المحل)', money(asInt(o['discount']))),
                ],
                const Divider(),
                Line('تحصّل من الزبون', money(asInt(o['total'])), bold: true),
                Line('ربحك', money(app.keeps(o)), color: teaOf(context)),
              ]),
            ),
          ]),
          bottomNavigationBar: SafeArea(
            child: Padding(padding: const EdgeInsets.fromLTRB(16, 8, 16, 12), child: action),
          ),
        );
      },
    );
  }
}
