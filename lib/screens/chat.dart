import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../store.dart';
import '../ui.dart';

class ChatScreen extends StatefulWidget {
  final String orderId;
  const ChatScreen({super.key, required this.orderId});
  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final input = TextEditingController();
  final scroll = ScrollController();
  late final Stream<QuerySnapshot<Map<String, dynamic>>> stream;

  static const quick = ['أنا في الطريق إليك', 'وصلت، أنا أمام العنوان', 'أين أنت بالضبط؟', 'المنتج غير متوفر، ماذا أشتري بدله؟'];

  @override
  void initState() {
    super.initState();
    app.openChatId = widget.orderId;
    stream = app.fs.collection('orders').doc(widget.orderId).collection('messages').orderBy('atMs').limitToLast(150).snapshots();
  }

  @override
  void dispose() {
    app.markSeen(widget.orderId);
    if (app.openChatId == widget.orderId) app.openChatId = null;
    input.dispose();
    scroll.dispose();
    super.dispose();
  }

  Future<void> _send(String t) async {
    if (t.trim().isEmpty) return;
    input.clear();
    try {
      await app.sendMsg(widget.orderId, t);
    } catch (e) {
      app.toast(errText(e));
    }
  }

  void _toEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (scroll.hasClients) scroll.jumpTo(scroll.position.maxScrollExtent);
    });
  }

  @override
  Widget build(BuildContext context) {
    final o = app.order(widget.orderId);
    final closed = o == null || !activeStatuses.contains(o['status']);
    final phone = '${o?['phone'] ?? ''}';
    final hint = Theme.of(context).hintColor;
    return Scaffold(
      appBar: AppBar(
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('${(o?['customerName'] ?? '').toString().isEmpty ? 'الزبون' : o!['customerName']}', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
          Text('طلب رقم ${o?['no'] ?? ''}', style: TextStyle(fontSize: 12, color: hint)),
        ]),
        actions: [
          if (phone.isNotEmpty)
            IconButton(tooltip: 'اتصل', onPressed: () => launchUrl(Uri(scheme: 'tel', path: phone)), icon: const Icon(Icons.call_rounded)),
        ],
      ),
      body: Column(children: [
        Expanded(
          child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
            stream: stream,
            builder: (context, snap) {
              if (snap.hasError) return Center(child: Text(errText(snap.error!)));
              if (!snap.hasData) return const Center(child: CircularProgressIndicator());
              final msgs = snap.data!.docs.map((d) => d.data()).toList();
              app.markSeen(widget.orderId);
              if (msgs.isEmpty) {
                return const EmptyState(icon: Icons.chat_bubble_outline_rounded, title: 'لا توجد رسائل بعد', text: 'اكتب للزبون مباشرة من هنا.');
              }
              _toEnd();
              return ListView.builder(
                controller: scroll,
                padding: const EdgeInsets.all(16),
                itemCount: msgs.length,
                itemBuilder: (context, i) {
                  final m = msgs[i];
                  final mine = m['by'] == 'courier';
                  return Align(
                    alignment: mine ? AlignmentDirectional.centerStart : AlignmentDirectional.centerEnd,
                    child: Container(
                      constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.78),
                      margin: const EdgeInsets.symmetric(vertical: 4),
                      padding: const EdgeInsets.fromLTRB(13, 9, 13, 7),
                      decoration: BoxDecoration(
                        color: mine ? (isDark(context) ? const Color(0xFF2E4482) : brand) : Theme.of(context).colorScheme.surface,
                        borderRadius: BorderRadiusDirectional.only(
                          topStart: const Radius.circular(16),
                          topEnd: const Radius.circular(16),
                          bottomStart: Radius.circular(mine ? 4 : 16),
                          bottomEnd: Radius.circular(mine ? 16 : 4),
                        ),
                        boxShadow: mine ? null : softShadow(context),
                      ),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('${m['text'] ?? ''}', style: TextStyle(color: mine ? Colors.white : null, fontSize: 15)),
                        const SizedBox(height: 2),
                        Text(clock(asInt(m['atMs'])), style: TextStyle(fontSize: 11, color: mine ? Colors.white70 : hint)),
                      ]),
                    ),
                  );
                },
              );
            },
          ),
        ),
        if (closed)
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text('انتهى هذا الطلب، والمحادثة للقراءة فقط.', style: TextStyle(color: hint)),
          )
        else ...[
          SizedBox(
            height: 44,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: quick.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (_, i) => ActionChip(label: Text(quick[i]), onPressed: () => _send(quick[i])),
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
              child: Row(children: [
                Expanded(
                  child: TextField(
                    controller: input,
                    textInputAction: TextInputAction.send,
                    onSubmitted: _send,
                    decoration: InputDecoration(
                      hintText: 'اكتب رسالة…',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
                      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: Theme.of(context).colorScheme.outlineVariant)),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton(
                  tooltip: 'إرسال',
                  onPressed: () => _send(input.text),
                  style: IconButton.styleFrom(
                    backgroundColor: isDark(context) ? const Color(0xFF2E4482) : brand,
                    foregroundColor: Colors.white,
                    fixedSize: const Size(50, 50),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                  icon: const Icon(Icons.send_rounded),
                ),
              ]),
            ),
          ),
        ],
      ]),
    );
  }
}
