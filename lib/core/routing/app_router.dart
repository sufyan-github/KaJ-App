import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/domain/entities/otp_challenge.dart';
import '../../features/auth/presentation/controllers/auth_controller.dart';
import '../../features/auth/presentation/controllers/auth_providers.dart';
import '../../features/auth/presentation/screens/otp_verify_screen.dart';
import '../../features/auth/presentation/screens/phone_entry_screen.dart';
import '../../features/bootstrap/presentation/screens/splash_screen.dart';
import '../../features/home/presentation/screens/home_screen.dart';

abstract final class AppRoutes {
  static const splash = '/';
  static const phone = '/auth/phone';
  static const otp = '/auth/otp';
  static const home = '/home';
}

final appRouterProvider = Provider<GoRouter>((ref) {
  final refresh = _RouterRefreshNotifier();
  ref
    ..listen<AuthState>(authControllerProvider, (_, _) => refresh.notify())
    ..onDispose(refresh.dispose);
  return GoRouter(
    initialLocation: AppRoutes.splash,
    refreshListenable: refresh,
    redirect: (context, state) =>
        authRedirect(ref.read(authControllerProvider), state.matchedLocation),
    routes: [
      GoRoute(
        path: AppRoutes.splash,
        builder: (context, state) => const SplashScreen(),
      ),
      GoRoute(
        path: AppRoutes.phone,
        builder: (context, state) => const PhoneEntryScreen(),
      ),
      GoRoute(
        path: AppRoutes.otp,
        redirect: (context, state) =>
            state.extra is OtpChallenge ? null : AppRoutes.phone,
        builder: (context, state) =>
            OtpVerifyScreen(challenge: state.extra! as OtpChallenge),
      ),
      GoRoute(
        path: AppRoutes.home,
        builder: (context, state) => const HomeScreen(),
      ),
    ],
  );
});

String? authRedirect(AuthState auth, String location) {
  final isSplash = location == AppRoutes.splash;
  final isAuthRoute = location == AppRoutes.phone || location == AppRoutes.otp;

  if (auth.status == AuthStatus.initial) {
    return isSplash ? null : AppRoutes.splash;
  }
  if (auth.status == AuthStatus.unauthenticated) {
    return location == AppRoutes.phone ? null : AppRoutes.phone;
  }
  if (auth.status == AuthStatus.authenticated) {
    return isSplash || isAuthRoute ? AppRoutes.home : null;
  }
  if (isSplash && auth.status != AuthStatus.loading) {
    return AppRoutes.phone;
  }
  return null;
}

class _RouterRefreshNotifier extends ChangeNotifier {
  void notify() => notifyListeners();
}
