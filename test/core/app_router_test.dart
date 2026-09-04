import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/routing/app_router.dart';
import 'package:kaaj/features/auth/domain/entities/otp_challenge.dart';
import 'package:kaaj/features/auth/presentation/controllers/auth_controller.dart';
import 'package:kaaj/features/onboarding/domain/onboarding_state.dart';

void main() {
  test('unknown sessions are held on splash', () {
    const auth = AuthState();

    expect(authRedirect(auth, AppRoutes.home), AppRoutes.splash);
    expect(authRedirect(auth, AppRoutes.splash), isNull);
  });

  test('unauthenticated sessions cannot open protected routes', () {
    const auth = AuthState(status: AuthStatus.unauthenticated);

    expect(authRedirect(auth, AppRoutes.home), AppRoutes.phone);
    expect(authRedirect(auth, AppRoutes.otp), AppRoutes.phone);
    expect(authRedirect(auth, AppRoutes.phone), isNull);
  });

  test('OTP route recovers its challenge after an auth-state refresh', () {
    const challenge = OtpChallenge(
      id: 'challenge-id',
      phone: '+8801712345678',
      expiresInSeconds: 300,
    );
    const auth = AuthState(status: AuthStatus.codeSent, challenge: challenge);

    expect(otpChallengeForRoute(null, auth), same(challenge));
    expect(otpChallengeForRoute(challenge, const AuthState()), same(challenge));
  });

  test('authenticated sessions cannot return to authentication routes', () {
    const auth = AuthState(status: AuthStatus.authenticated);

    expect(authRedirect(auth, AppRoutes.phone), AppRoutes.home);
    expect(authRedirect(auth, AppRoutes.otp), AppRoutes.home);
    expect(authRedirect(auth, AppRoutes.home), isNull);
  });

  test('a newly verified user is routed into onboarding', () {
    const auth = AuthState(status: AuthStatus.authenticated, isNewUser: true);

    expect(authRedirect(auth, AppRoutes.otp), AppRoutes.onboardingProfile);
    expect(authRedirect(auth, AppRoutes.onboardingProfile), isNull);
  });

  test(
    'persisted onboarding resumes the correct worker step after relaunch',
    () {
      const auth = AuthState(status: AuthStatus.authenticated);
      const onboarding = OnboardingState(
        started: true,
        step: 4,
        role: KaajRole.worker,
      );

      expect(
        authRedirect(auth, AppRoutes.home, onboarding: onboarding),
        AppRoutes.onboardingAvailability,
      );
      expect(
        onboardingRouteForStep(onboarding),
        AppRoutes.onboardingAvailability,
      );
    },
  );

  test('completed onboarding cannot reopen onboarding routes', () {
    const auth = AuthState(status: AuthStatus.authenticated);
    const onboarding = OnboardingState(started: true, complete: true, step: 6);

    expect(
      authRedirect(auth, AppRoutes.onboardingProfile, onboarding: onboarding),
      AppRoutes.home,
    );
  });

  test('work type route preserves category and subtype filters', () {
    final uri = Uri.parse(
      AppRoutes.jobsForType(
        categoryId: 'category-id',
        categoryName: 'শিক্ষা',
        skillId: 'skill-id',
        skillName: 'পড়ানো',
      ),
    );

    expect(uri.path, AppRoutes.jobs);
    expect(uri.queryParameters['categoryId'], 'category-id');
    expect(uri.queryParameters['skillId'], 'skill-id');
    expect(uri.queryParameters['skillName'], 'পড়ানো');
  });
}
