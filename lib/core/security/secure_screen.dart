import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

/// Native switch for screenshot protection (Android FLAG_SECURE).
abstract final class ScreenProtection {
  static const channel = MethodChannel('app.kaaj.mobile/secure');
  static int _holders = 0;

  /// Number of protected screens currently shown.
  @visibleForTesting
  static int get holders => _holders;

  static Future<void> acquire() async {
    _holders++;
    if (_holders == 1) await _set(true);
  }

  static Future<void> release() async {
    if (_holders == 0) return;
    _holders--;
    if (_holders == 0) await _set(false);
  }

  static Future<void> _set(bool secure) async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return;
    try {
      await channel.invokeMethod<void>('setSecure', secure);
    } on Object {
      // Older builds without the channel: nothing to protect with.
    }
  }
}

/// Blocks screenshots, screen recording and the recent-apps preview while
/// [child] is on screen: identity documents, selfies and chats.
class SecureScreen extends StatefulWidget {
  const SecureScreen({required this.child, super.key});

  final Widget child;

  @override
  State<SecureScreen> createState() => _SecureScreenState();
}

class _SecureScreenState extends State<SecureScreen> {
  @override
  void initState() {
    super.initState();
    ScreenProtection.acquire();
  }

  @override
  void dispose() {
    ScreenProtection.release();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
