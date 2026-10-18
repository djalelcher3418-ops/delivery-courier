import 'package:flutter/material.dart';

import '../store.dart';
import '../ui.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final phone = TextEditingController();
  final pass = TextEditingController();
  bool busy = false, hide = true;
  String err = '';

  Future<void> _go() async {
    final p = cleanPhone(phone.text);
    if (!phoneOk(p)) {
      setState(() => err = 'اكتب رقم هاتف صحيحاً من 10 أرقام يبدأ بـ 05 أو 06 أو 07.');
      return;
    }
    if (pass.text.length < 6) {
      setState(() => err = 'كلمة السر 6 أحرف على الأقل.');
      return;
    }
    setState(() {
      busy = true;
      err = '';
    });
    try {
      await app.login(p, pass.text);
    } catch (e) {
      if (mounted) setState(() => err = errText(e));
    }
    if (mounted) setState(() => busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final hint = Theme.of(context).hintColor;
    return Scaffold(
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.all(22), children: [
          const SizedBox(height: 30),
          // لوحة نيلية بنقش الزليج
          ClipRRect(
            borderRadius: BorderRadius.circular(28),
            child: SizedBox(
              height: 168,
              child: Stack(children: [
                const Positioned.fill(child: ColoredBox(color: brand)),
                const Zellige(),
                Center(
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    const StarBadge(size: 72, color: star, child: Icon(Icons.delivery_dining_rounded, size: 38, color: ink)),
                    const SizedBox(height: 10),
                    Text('Delivery الموصّل',
                        style: Theme.of(context).textTheme.headlineSmall?.copyWith(color: Colors.white, fontSize: 24, height: 1.2)),
                  ]),
                ),
              ]),
            ),
          ),
          const SizedBox(height: 24),
          Text('دخول الموصّلين', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontSize: 25)),
          const SizedBox(height: 4),
          Text('رقمك وكلمة السر تحصل عليهما من إدارة Delivery.', style: TextStyle(color: hint)),
          const SizedBox(height: 18),
          TextField(
            controller: phone,
            keyboardType: TextInputType.phone,
            textDirection: TextDirection.ltr,
            textAlign: TextAlign.right,
            autofillHints: const [AutofillHints.username],
            decoration: const InputDecoration(labelText: 'رقم الهاتف', hintText: '05XX XX XX XX', prefixIcon: Icon(Icons.phone_rounded)),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: pass,
            obscureText: hide,
            textDirection: TextDirection.ltr,
            textAlign: TextAlign.right,
            autofillHints: const [AutofillHints.password],
            onSubmitted: (_) => _go(),
            decoration: InputDecoration(
              labelText: 'كلمة السر',
              prefixIcon: const Icon(Icons.lock_rounded),
              suffixIcon: IconButton(
                tooltip: hide ? 'إظهار' : 'إخفاء',
                onPressed: () => setState(() => hide = !hide),
                icon: Icon(hide ? Icons.visibility_rounded : Icons.visibility_off_rounded),
              ),
            ),
          ),
          if (err.isNotEmpty) ...[
            const SizedBox(height: 12),
            Note(err, color: danger, icon: Icons.error_outline_rounded),
          ],
          const SizedBox(height: 18),
          FilledButton(
            onPressed: busy ? null : _go,
            child: busy
                ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                : const Text('دخول'),
          ),
        ]),
      ),
    );
  }
}
