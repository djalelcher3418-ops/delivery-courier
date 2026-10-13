import 'package:flutter/material.dart';

import '../store.dart';
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
            bottomNavigationBar: NavigationBar(
              selectedIndex: tab,
              onDestinationSelected: (i) => setState(() => tab = i),
              destinations: [
                NavigationDestination(
                  icon: Badge(isLabelVisible: n > 0, label: Text('$n'), child: const Icon(Icons.delivery_dining_outlined)),
                  selectedIcon: Badge(isLabelVisible: n > 0, label: Text('$n'), child: const Icon(Icons.delivery_dining_rounded)),
                  label: 'الطلبات',
                ),
                const NavigationDestination(
                  icon: Icon(Icons.account_balance_wallet_outlined),
                  selectedIcon: Icon(Icons.account_balance_wallet_rounded),
                  label: 'حصيلتي',
                ),
                const NavigationDestination(
                  icon: Icon(Icons.history_outlined),
                  selectedIcon: Icon(Icons.history_rounded),
                  label: 'السجل',
                ),
                const NavigationDestination(
                  icon: Icon(Icons.person_outline_rounded),
                  selectedIcon: Icon(Icons.person_rounded),
                  label: 'حسابي',
                ),
              ],
            ),
          );
      },
    );
  }
}
