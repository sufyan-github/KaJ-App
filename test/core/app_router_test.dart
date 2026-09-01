import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/routing/app_router.dart';
import 'package:kaaj/features/auth/presentation/controllers/auth_controller.dart';

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

  test('authenticated sessions cannot return to authentication routes', () {
    const auth = AuthState(status: AuthStatus.authenticated);

    expect(authRedirect(auth, AppRoutes.phone), AppRoutes.home);
    expect(authRedirect(auth, AppRoutes.otp), AppRoutes.home);
    expect(authRedirect(auth, AppRoutes.home), isNull);
  });
}
