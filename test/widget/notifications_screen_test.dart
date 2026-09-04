import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:kaaj/core/errors/failure.dart';
import 'package:kaaj/core/permissions/permission_gateway.dart';
import 'package:kaaj/core/theme/app_theme.dart';
import 'package:kaaj/features/notifications/data/notifications_repository.dart';
import 'package:kaaj/features/notifications/domain/app_notification.dart';
import 'package:kaaj/features/notifications/presentation/controllers/notifications_providers.dart';
import 'package:kaaj/features/notifications/presentation/screens/notifications_screen.dart';
import 'package:mocktail/mocktail.dart';

void main() {
  late _MockNotificationsRepository repository;

  setUp(() {
    repository = _MockNotificationsRepository();
    when(repository.getNotifications).thenAnswer(
      (_) async => NotificationInbox(
        unreadCount: 2,
        items: [
          _notification(
            id: 'application',
            type: 'JOB_APPLICATION_RECEIVED',
            title: 'নতুন আবেদন',
            body: 'গণিত পড়ানো কাজটিতে একজন কর্মী আবেদন করেছেন।',
            route: '/jobs',
          ),
          _notification(
            id: 'message',
            type: 'CHAT_MESSAGE',
            title: 'নতুন বার্তা',
            body: 'কাজের আলোচনায় একটি বার্তা এসেছে।',
            route: '/messages',
          ),
        ],
      ),
    );
    when(repository.markAllRead).thenAnswer((_) async {});
    when(() => repository.markRead(any())).thenAnswer((_) async {});
  });

  testWidgets('shows readable Bangla content, unread summary, and filters', (
    tester,
  ) async {
    await tester.pumpWidget(_app(repository));
    await tester.pumpAndSettle();

    expect(find.text('২টি অপঠিত আপডেট আছে'), findsOneWidget);
    expect(find.text('নতুন আবেদন'), findsOneWidget);
    expect(find.text('নতুন বার্তা'), findsOneWidget);
    expect(find.text('আজ'), findsOneWidget);

    await tester.tap(find.widgetWithText(FilterChip, 'আবেদনসমূহ'));
    await tester.pumpAndSettle();

    expect(find.text('নতুন আবেদন'), findsOneWidget);
    expect(find.text('নতুন বার্তা'), findsNothing);
  });

  testWidgets('marks all notifications as read', (tester) async {
    await tester.pumpWidget(_app(repository));
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('সব পড়েছি'));
    await tester.pump();

    verify(repository.markAllRead).called(1);
  });

  testWidgets('marks one notification read and opens its destination', (
    tester,
  ) async {
    await tester.pumpWidget(_app(repository));
    await tester.pumpAndSettle();

    await tester.tap(find.text('নতুন আবেদন'));
    await tester.pumpAndSettle();

    verify(() => repository.markRead('application')).called(1);
    expect(find.text('কাজের তালিকা'), findsOneWidget);
  });

  testWidgets('shows an informative empty state', (tester) async {
    when(repository.getNotifications).thenAnswer(
      (_) async => const NotificationInbox(items: [], unreadCount: 0),
    );

    await tester.pumpWidget(_app(repository));
    await tester.pumpAndSettle();

    expect(find.text('এখনো কোনো নোটিফিকেশন নেই'), findsOneWidget);
    expect(find.textContaining('আবেদন, বুকিং, বার্তা'), findsOneWidget);
  });

  testWidgets('shows a Bangla connection error with retry', (tester) async {
    when(repository.getNotifications).thenThrow(
      const Failure(
        kind: FailureKind.network,
        message: 'No internet connection.',
        retryable: true,
      ),
    );

    await tester.pumpWidget(_app(repository));
    await tester.pumpAndSettle();

    expect(
      find.text('ইন্টারনেট সংযোগ নেই। সংযোগ ঠিক করে আবার চেষ্টা করুন।'),
      findsOneWidget,
    );
    expect(find.text('আবার চেষ্টা করুন'), findsOneWidget);
  });

  testWidgets('explains denied phone notifications and opens settings', (
    tester,
  ) async {
    final permissionGateway = _DeniedPermissionGateway();

    await tester.pumpWidget(
      _app(repository, permissionGateway: permissionGateway),
    );
    await tester.pumpAndSettle();

    expect(find.text('ফোনের নোটিফিকেশন বন্ধ আছে'), findsOneWidget);
    expect(find.textContaining('ইনবক্স ব্যবহার করা যাবে'), findsOneWidget);
    await tester.tap(find.text('সেটিংসে যান'));
    await tester.pump();
    expect(permissionGateway.didOpenSettings, isTrue);
  });

  testWidgets('refreshes notification permission after returning to the app', (
    tester,
  ) async {
    await tester.pumpWidget(
      _app(repository, permissionGateway: _DeniedPermissionGateway()),
    );
    await tester.pumpAndSettle();

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.text('ফোনের নোটিফিকেশন বন্ধ আছে'), findsOneWidget);
  });

  testWidgets('remains usable at 200% text on a narrow phone', (tester) async {
    tester.view.physicalSize = const Size(960, 1920);
    tester.view.devicePixelRatio = 3;
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

    await tester.pumpWidget(_app(repository));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.text('নোটিফিকেশন'), findsOneWidget);
    expect(find.text('নতুন আবেদন'), findsOneWidget);
  });
}

Widget _app(
  NotificationsRepository repository, {
  PermissionGateway permissionGateway = const _GrantedPermissionGateway(),
}) {
  final router = GoRouter(
    initialLocation: '/notifications',
    routes: [
      GoRoute(
        path: '/notifications',
        builder: (_, _) =>
            NotificationsScreen(permissionGateway: permissionGateway),
      ),
      GoRoute(
        path: '/jobs',
        builder: (_, _) => const Scaffold(body: Text('কাজের তালিকা')),
      ),
      GoRoute(
        path: '/messages',
        builder: (_, _) => const Scaffold(body: Text('বার্তা')),
      ),
    ],
  );
  return ProviderScope(
    overrides: [notificationsRepositoryProvider.overrideWithValue(repository)],
    child: MaterialApp.router(
      theme: buildAppTheme(),
      locale: const Locale('bn'),
      supportedLocales: const [Locale('bn'), Locale('en')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      routerConfig: router,
    ),
  );
}

AppNotification _notification({
  required String id,
  required String type,
  required String title,
  required String body,
  required String route,
}) => AppNotification(
  id: id,
  type: type,
  title: title,
  body: body,
  createdAt: DateTime.now(),
  isRead: false,
  payload: const {},
  route: route,
);

class _MockNotificationsRepository extends Mock
    implements NotificationsRepository {}

class _GrantedPermissionGateway extends PermissionGateway {
  const _GrantedPermissionGateway();

  @override
  Future<KPermissionStatus> status(KPermission permission) async =>
      KPermissionStatus.granted;
}

class _DeniedPermissionGateway extends PermissionGateway {
  bool didOpenSettings = false;

  @override
  Future<bool> openSettings() async {
    didOpenSettings = true;
    return true;
  }

  @override
  Future<KPermissionStatus> status(KPermission permission) async =>
      KPermissionStatus.denied;
}
