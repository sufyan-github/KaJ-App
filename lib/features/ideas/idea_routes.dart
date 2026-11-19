import 'package:go_router/go_router.dart';

import 'presentation/my_ideas_section.dart';

/// Paths of the Ideas screens. All start with `/ideas`, which the paywall
/// guard leaves free.
abstract final class IdeaPaths {
  static const mine = '/ideas/mine';
  static const create = '/ideas/new';
  static String detail(String id) => '/ideas/$id';
  static String edit(String id) => '/ideas/$id/edit';
  static String access(String id) => '/ideas/$id/access';
  static String views(String id) => '/ideas/$id/views';
  static String newRole(String id) => '/ideas/$id/roles/new';
  static String editRole(String id, String roleId) =>
      '/ideas/$id/roles/$roleId/edit';
  static String matches(String id, String roleId) =>
      '/ideas/$id/roles/$roleId/matches';
  static String team(String id) => '/ideas/$id/team';
  static String convert(String id) => '/ideas/$id/convert';

  /// Screens owned by other parts of the app.
  static String business(String id) => '/businesses/$id';
  static String collaboration(String id) => '/collaboration-requests/$id';
}

/// Screens of Ideas (always free).
List<RouteBase> ideaRoutes() => [
  GoRoute(path: IdeaPaths.mine, builder: (_, _) => const MyIdeasScreen()),
];
