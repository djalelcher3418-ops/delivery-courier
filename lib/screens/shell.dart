import 'package:flutter/material.dart';

import '../store.dart';
import '../ui.dart';
import 'account.dart';
import 'earn.dart';
import 'history.dart';
import 'home.dart';

class Shell extends StatefulWidget {
  const Shell({super.key});
  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> {
  int tab = 0;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: app,
      builder: (context, _) {
        final n = app.active.length;
        return Scaffold(
            body: IndexedStack(index: tab, children: const [HomeScreen(), EarnScreen(), HistoryScreen(), AccountScreen()]),
            bottomNavigationBar: BottomBar(
              index: tab,
              onTap: (i) => setState(() => tab = i),
              items: [
                BarItem(Icons.delivery_dining_outlined, Icons.delivery_dining_rounded, 'الطلبات', badge: n > 0 ? '$n' : null),
                const BarItem(Icons.account_balance_wallet_outlined, Icons.account_balance_wallet_rounded, 'حصيلتي'),
                const BarItem(Icons.history_outlined, Icons.history_rounded, 'السجل'),
                const BarItem(Icons.person_outline_rounded, Icons.person_rounded, 'حسابي'),
              ],
            ),
          );
      },
    );
  }
}
