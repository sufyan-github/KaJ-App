import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/domain/entities/otp_challenge.dart';
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
  return GoRouter(
    initialLocation: AppRoutes.splash,
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
