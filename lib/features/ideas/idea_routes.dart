import 'package:go_router/go_router.dart';

import 'presentation/idea_access_screens.dart';
import 'presentation/idea_detail_screen.dart';
import 'presentation/idea_editor_screen.dart';
import 'presentation/idea_role_screens.dart';
import 'presentation/idea_team_screens.dart';
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
  GoRoute(path: IdeaPaths.create, builder: (_, _) => const IdeaEditorScreen()),
  GoRoute(
    path: '/ideas/:id',
    builder: (_, state) =>
        IdeaDetailScreen(ideaId: state.pathParameters['id']!),
    routes: [
      GoRoute(
        path: 'edit',
        builder: (_, state) =>
            IdeaEditorScreen(ideaId: state.pathParameters['id']),
      ),
      GoRoute(
        path: 'access',
        builder: (_, state) =>
            IdeaAccessScreen(ideaId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: 'views',
        builder: (_, state) =>
            IdeaViewsScreen(ideaId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: 'roles/new',
        builder: (_, state) =>
            IdeaRoleEditorScreen(ideaId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: 'roles/:roleId/edit',
        builder: (_, state) => IdeaRoleEditorScreen(
          ideaId: state.pathParameters['id']!,
          roleId: state.pathParameters['roleId'],
        ),
      ),
      GoRoute(
        path: 'roles/:roleId/matches',
        builder: (_, state) => IdeaRoleMatchesScreen(
          ideaId: state.pathParameters['id']!,
          roleId: state.pathParameters['roleId']!,
        ),
      ),
      GoRoute(
        path: 'team',
        builder: (_, state) =>
            IdeaTeamScreen(ideaId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: 'convert',
        builder: (_, state) =>
            IdeaConvertScreen(ideaId: state.pathParameters['id']!),
      ),
    ],
  ),
];
