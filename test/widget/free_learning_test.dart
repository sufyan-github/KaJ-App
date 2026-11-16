import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/routing/app_router.dart';
import 'package:kaaj/features/auth/presentation/controllers/auth_controller.dart';
import 'package:kaaj/features/auth/presentation/controllers/auth_providers.dart';
import 'package:kaaj/features/billing/domain/billing_models.dart';
import 'package:kaaj/features/billing/presentation/billing_screens.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';

void main() {
  group('free modules from /subscriptions/me', () {
    test('read from freeModules or moduleAccess; absent means none', () {
      expect(
        SubscriptionOverview.fromJson({
          'freeModules': ['learn', 'COMMUNITY'],
        }).freeModules,
        {'LEARN', 'COMMUNITY'},
      );
      expect(
        SubscriptionOverview.fromJson({
          'moduleAccess': {'WORK': false, 'LEARN': true},
        }).freeModules,
        {'LEARN'},
      );
      expect(SubscriptionOverview.fromJson({}).freeModules, isEmpty);
    });
  });

  group('router without a subscription', () {
    const unsubscribed = AuthState(
      status: AuthStatus.authenticated,
      subscriptionAccess: false,
      freeModules: {'LEARN'},
    );

    test('learning screens stay open when Learn is free', () {
      expect(authRedirect(unsubscribed, AppRoutes.training), isNull);
      expect(
        authRedirect(unsubscribed, AppRoutes.trainingCourse('c1')),
        isNull,
      );
      expect(authRedirect(unsubscribed, AppRoutes.explore), isNull);
      expect(authRedirect(unsubscribed, AppRoutes.activity), isNull);
    });

    test('work still asks for the subscription', () {
      expect(
        authRedirect(unsubscribed, AppRoutes.jobs),
        AppRoutes.subscription,
      );
      expect(
        authRedirect(unsubscribed, AppRoutes.home),
        AppRoutes.subscription,
      );
    });

    test('an older server without the field keeps the full paywall', () {
      const older = AuthState(
        status: AuthStatus.authenticated,
        subscriptionAccess: false,
      );
      expect(authRedirect(older, AppRoutes.training), AppRoutes.subscription);
    });
  });

  for (final language in ['en', 'bn']) {
    testWidgets('the paywall offers free learning ($language)', (tester) async {
      final api = FakeApi()
        ..on(
          'GET /subscriptions/me',
          FakeResponse.data({
            'accessActive': false,
            'freeModules': ['LEARN'],
          }),
        );
      final auth = signedInAuth()
        ..resolveAccess(
          allowed: false,
          needsPassword: false,
          freeModules: const {'LEARN'},
        );
      await pumpRouted(
        tester,
        api: api,
        home: const SubscriptionScreen(),
        locale: Locale(language),
        overrides: [authControllerProvider.overrideWith((ref) => auth)],
      );
      expect(
        find.text(language == 'en' ? 'Learning is free' : 'শেখা বিনামূল্যে'),
        findsOneWidget,
      );
      await tester.tap(find.byKey(const ValueKey('free-learning')));
      await tester.pumpAndSettle();
      expect(find.text('route:/explore?section=learn'), findsOneWidget);
    });
  }
}
