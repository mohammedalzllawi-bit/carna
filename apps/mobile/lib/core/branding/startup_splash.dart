import 'package:flutter/material.dart';
import 'platform_branding.dart';

class StartupSplash extends StatefulWidget {
  const StartupSplash({super.key, required this.child});
  final Widget child;
  @override
  State<StartupSplash> createState() => _StartupSplashState();
}

class _StartupSplashState extends State<StartupSplash>
    with SingleTickerProviderStateMixin {
  late final AnimationController animation = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 850))
    ..forward();
  @override
  void initState() {
    super.initState();
    animation.addStatusListener((status) {
      if (status == AnimationStatus.completed && mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    animation.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final reduced = MediaQuery.disableAnimationsOf(context);
    if (reduced || animation.isCompleted) return widget.child;
    return Stack(children: [
      widget.child,
      Positioned.fill(
          child: ColoredBox(
              color: Colors.white,
              child: Center(
                  child: AnimatedBuilder(
                animation: animation,
                builder: (context, child) => Opacity(
                    opacity: (animation.value * 3).clamp(0, 1),
                    child: Transform.scale(
                        scale: .92 +
                            .08 * Curves.easeOut.transform(animation.value),
                        child: child)),
                child: const Column(mainAxisSize: MainAxisSize.min, children: [
                  PlatformLogo(size: 90),
                  SizedBox(height: 20),
                  Text('كارنا',
                      style: TextStyle(
                          fontSize: 30,
                          fontWeight: FontWeight.w800,
                          color: Color(0xFF1769D2)))
                ]),
              ))))
    ]);
  }
}
