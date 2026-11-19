import 'package:go_router/go_router.dart';

import 'presentation/consultation_booking_screen.dart';
import 'presentation/introduction_screens.dart';
import 'presentation/session_detail_screen.dart';
import 'presentation/session_form_screen.dart';
import 'presentation/session_screens.dart';

/// Paths of the Experts and Community screens. Every path starts with a
/// prefix the paywall guard keeps free.
abstract final class CommunityPaths {
  static const introductions = '/introductions';
  static String introduction(String id) => '/introductions/$id';
  static String introduce(String expertUserId, {String? name}) => _withQuery(
    '/experts/$expertUserId/introduce',
    {if (name != null && name.isNotEmpty) 'name': name},
  );
  static String book(
    String expertUserId, {
    String? name,
    String? introductionId,
  }) => _withQuery('/experts/$expertUserId/book', {
    if (name != null && name.isNotEmpty) 'name': name,
    'introductionId': ?introductionId,
  });

  static const sessions = '/sessions';
  static const newSession = '/sessions/new';
  static String session(String id) => '/sessions/$id';
  static String editSession(String id) => '/sessions/$id/edit';

  static const groups = '/community/groups';
  static const newGroup = '/community/groups/new';
  static String group(String id) => '/community/groups/$id';
  static String editGroup(String id) => '/community/groups/$id/edit';
  static String groupMembers(String id) => '/community/groups/$id/members';
  static String groupAnnouncements(String id) =>
      '/community/groups/$id/announcements';
  static String groupSessions(String id) => '/community/groups/$id/sessions';
  static String newGroupSession(String id) =>
      '/community/groups/$id/sessions/new';

  static String _withQuery(String path, Map<String, String> query) =>
      Uri(path: path, queryParameters: query.isEmpty ? null : query).toString();
}

/// Screens of Experts and Community: introductions, sessions, groups.
List<RouteBase> communityRoutes() => [
  GoRoute(
    path: CommunityPaths.introductions,
    builder: (context, state) => const IntroductionsScreen(),
  ),
  GoRoute(
    path: '/introductions/:id',
    builder: (context, state) =>
        IntroductionDetailScreen(introductionId: state.pathParameters['id']!),
  ),
  GoRoute(
    path: '/experts/:userId/introduce',
    builder: (context, state) => SendIntroductionScreen(
      expertUserId: state.pathParameters['userId']!,
      expertName: state.uri.queryParameters['name'],
    ),
  ),
  GoRoute(
    path: '/experts/:userId/book',
    builder: (context, state) => ConsultationBookingScreen(
      expertUserId: state.pathParameters['userId']!,
      expertName: state.uri.queryParameters['name'],
      introductionId: state.uri.queryParameters['introductionId'],
    ),
  ),
  GoRoute(
    path: CommunityPaths.sessions,
    builder: (context, state) => const SessionsScreen(),
  ),
  // Declared before the detail path so "new" is not read as an id.
  GoRoute(
    path: CommunityPaths.newSession,
    builder: (context, state) => const SessionFormScreen(),
  ),
  GoRoute(
    path: '/sessions/:id',
    builder: (context, state) =>
        SessionDetailScreen(sessionId: state.pathParameters['id']!),
  ),
  GoRoute(
    path: '/sessions/:id/edit',
    builder: (context, state) =>
        SessionFormScreen(sessionId: state.pathParameters['id']),
  ),
];
