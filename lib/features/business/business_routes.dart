import 'package:go_router/go_router.dart';

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
List<RouteBase> businessRoutes() => [];
