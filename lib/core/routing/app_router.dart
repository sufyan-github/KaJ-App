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
import '../../features/onboarding/domain/onboarding_state.dart';
import '../../features/onboarding/presentation/controllers/onboarding_controller.dart';
import '../../features/onboarding/presentation/screens/onboarding_screens.dart';
import '../../features/profile/presentation/screens/phase2_hub_screens.dart';

abstract final class AppRoutes {
  static const splash = '/';
  static const phone = '/auth/phone';
  static const otp = '/auth/otp';
  static const home = '/home';
  static const onboardingProfile = '/onboarding/profile';
  static const onboardingRole = '/onboarding/role';
  static const onboardingLocation = '/onboarding/location';
  static const onboardingSkills = '/onboarding/worker';
  static const onboardingAvailability = '/onboarding/availability';
  static const onboardingTour = '/onboarding/tour';
  static const categories = '/categories';
  static const publicWorkerProfile = '/workers/preview';
  static const editWorkerSkills = '/w/profile/skills';
  static const editAvailability = '/w/availability';
  static const settings = '/settings';
  static const helpSafety = '/help-safety';
}

final appRouterProvider = Provider<GoRouter>((ref) {
  final refresh = _RouterRefreshNotifier();
  ref
    ..listen<AuthState>(authControllerProvider, (_, _) => refresh.notify())
    ..listen<OnboardingState>(
      onboardingControllerProvider,
      (_, _) => refresh.notify(),
    )
    ..onDispose(refresh.dispose);
  return GoRouter(
    initialLocation: AppRoutes.splash,
    refreshListenable: refresh,
    redirect: (context, state) => authRedirect(
      ref.read(authControllerProvider),
      state.matchedLocation,
      onboarding: ref.read(onboardingControllerProvider),
    ),
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
      GoRoute(
        path: AppRoutes.onboardingProfile,
        builder: (context, state) => const ProfileSetupScreen(),
      ),
      GoRoute(
        path: AppRoutes.onboardingRole,
        builder: (context, state) => const RoleSelectionScreen(),
      ),
      GoRoute(
        path: AppRoutes.onboardingLocation,
        builder: (context, state) => const LocationSelectionScreen(),
      ),
      GoRoute(
        path: AppRoutes.onboardingSkills,
        builder: (context, state) => const WorkerSkillsScreen(),
      ),
      GoRoute(
        path: AppRoutes.onboardingAvailability,
        builder: (context, state) => const AvailabilitySetupScreen(),
      ),
      GoRoute(
        path: AppRoutes.onboardingTour,
        builder: (context, state) => const OnboardingTourScreen(),
      ),
      GoRoute(
        path: AppRoutes.categories,
        builder: (context, state) => const CategoriesBrowseScreen(),
      ),
      GoRoute(
        path: AppRoutes.publicWorkerProfile,
        builder: (context, state) => const PublicWorkerProfileScreen(),
      ),
      GoRoute(
        path: AppRoutes.editWorkerSkills,
        builder: (context, state) => const WorkerSkillsScreen(isEditing: true),
      ),
      GoRoute(
        path: AppRoutes.editAvailability,
        builder: (context, state) =>
            const AvailabilitySetupScreen(isEditing: true),
      ),
      GoRoute(
        path: AppRoutes.settings,
        builder: (context, state) => const SettingsScreen(),
      ),
      GoRoute(
        path: AppRoutes.helpSafety,
        builder: (context, state) => const HelpSafetyScreen(),
      ),
    ],
  );
});

String? authRedirect(
  AuthState auth,
  String location, {
  OnboardingState onboarding = const OnboardingState(),
}) {
  final isSplash = location == AppRoutes.splash;
  final isAuthRoute = location == AppRoutes.phone || location == AppRoutes.otp;

  if (auth.status == AuthStatus.initial) {
    return isSplash ? null : AppRoutes.splash;
  }
  if (auth.status == AuthStatus.unauthenticated) {
    return location == AppRoutes.phone ? null : AppRoutes.phone;
  }
  if (auth.status == AuthStatus.authenticated) {
    if (onboarding.started && !onboarding.complete) {
      final target = onboardingRouteForStep(onboarding);
      return location.startsWith('/onboarding/') ? null : target;
    }
    return isSplash || isAuthRoute || location.startsWith('/onboarding/')
        ? AppRoutes.home
        : null;
  }
  if (isSplash && auth.status != AuthStatus.loading) {
    return AppRoutes.phone;
  }
  return null;
}

String onboardingRouteForStep(OnboardingState state) => switch (state.step) {
  0 => AppRoutes.onboardingProfile,
  1 => AppRoutes.onboardingRole,
  2 => AppRoutes.onboardingLocation,
  3 when state.role == KaajRole.worker => AppRoutes.onboardingSkills,
  4 => AppRoutes.onboardingAvailability,
  _ => AppRoutes.onboardingTour,
};

class _RouterRefreshNotifier extends ChangeNotifier {
  void notify() => notifyListeners();
}
