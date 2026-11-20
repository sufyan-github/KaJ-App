import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/routing/app_router.dart';

/// Every `payload.route` / `deepLink` pattern the backend sends in a
/// notification (p3-contracts.md section 7, backend e3d6428) must open a
/// screen of this app, never the not-found page.
const notificationRoutes = [
  // Work
  '/assignments', '/assignments/a1', '/jobs', '/jobs/j1', '/disputes/d1',
  '/verification', '/reviews', '/training/certificates',
  '/conversations/c1',
  // Learn
  '/learn/opportunities/o1', '/learn/enrolments/e1',
  // Business and collaboration
  '/businesses/b1', '/collaboration-requests/r1',
  // Ideas
  '/ideas/i1', '/ideas/i1/access',
  // Experts and Community
  '/introductions/n1', '/sessions/s1', '/community/groups/g1',
  '/community/groups/g1/members', '/community/groups/g1/announcements',
];

void main() {
  test('every notification route has a screen', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final router = container.read(appRouterProvider);
    addTearDown(router.dispose);
    for (final route in notificationRoutes) {
      final match = router.configuration.findMatch(Uri.parse(route));
      expect(match.isError, isFalse, reason: route);
      expect(match.isEmpty, isFalse, reason: route);
      expect(match.uri.path, route, reason: route);
    }
  });

  test('an unknown route does not match', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final router = container.read(appRouterProvider);
    addTearDown(router.dispose);
    final match = router.configuration.findMatch(Uri.parse('/nowhere/x'));
    expect(match.isError || match.isEmpty, isTrue);
  });
}
