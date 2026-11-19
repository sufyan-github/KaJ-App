import 'package:go_router/go_router.dart';

import '../jobs/presentation/screens/jobs_screens.dart';
import 'presentation/business_detail_screen.dart';
import 'presentation/business_form_screen.dart';
import 'presentation/my_businesses_screen.dart';

/// Paths of the Business screens. All start with `/businesses`, `/partners`
/// or `/collaboration-requests`, which the paywall guard leaves free.
abstract final class BusinessRoutes {
  static const mine = '/businesses';
  static const create = '/businesses/new';
  static const partners = '/partners';
  static const collaborations = '/collaboration-requests';

  static String detail(String id) => '/businesses/$id';
  static String edit(String id) => '/businesses/$id/edit';
  static String members(String id) => '/businesses/$id/members';
  static String offerings(String id) => '/businesses/$id/offerings';
  static String verification(String id) => '/businesses/$id/verification';
  static String staffJob(String id) => '/businesses/$id/jobs/new';
  static String collaborate(String id) => '/businesses/$id/collaborate';
  static String collaboration(String id) => '/collaboration-requests/$id';
}

/// Screens of Business, partners and collaboration (always free).
List<RouteBase> businessRoutes() => [
  GoRoute(
    path: BusinessRoutes.mine,
    builder: (_, _) => const MyBusinessesScreen(),
  ),
  // Before `/businesses/:id`, so "new" is not read as an id.
  GoRoute(
    path: BusinessRoutes.create,
    builder: (_, _) => const BusinessFormScreen(),
  ),
  GoRoute(
    path: '/businesses/:id',
    builder: (_, state) =>
        BusinessDetailScreen(businessId: state.pathParameters['id']!),
  ),
  GoRoute(
    path: '/businesses/:id/edit',
    builder: (_, state) =>
        BusinessFormScreen(businessId: state.pathParameters['id']),
  ),
  GoRoute(
    path: '/businesses/:id/jobs/new',
    builder: (_, state) =>
        CreateJobScreen(businessProfileId: state.pathParameters['id']),
  ),
];
