import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/features/business/presentation/my_business_section.dart';
import 'package:kaaj/features/business/presentation/my_businesses_screen.dart';
import 'package:kaaj/features/onboarding/domain/onboarding_state.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';

Map<String, dynamic> _business(
  String id,
  String name, {
  String? myRole,
  bool verified = false,
}) => {
  'id': id,
  'name': name,
  'stage': verified ? 'REGISTERED' : 'INFORMAL',
  'stageLabel': {
    'en': verified ? 'Registered' : 'Informal',
    'bn': verified ? 'নিবন্ধিত' : 'অনানুষ্ঠানিক',
  },
  'description': null,
  'category': {
    'id': 'cat-1',
    'slug': 'food',
    'nameEn': 'Food',
    'nameBn': 'খাদ্য',
  },
  'area': {'id': 'area-1', 'nameEn': 'Boalia', 'nameBn': 'বোয়ালিয়া'},
  'employeesCount': 3,
  'isPublic': true,
  'seekingPartners': false,
  'verified': verified,
  'owner': {'userId': 'u-9', 'displayName': 'K***', 'trustLevel': 'IDENTITY'},
  'createdAt': '2026-11-01T10:00:00Z',
  if (myRole != null) ...{'myRole': myRole, 'status': 'ACTIVE'},
};

FakeApi _api({bool withInvitation = true}) => FakeApi()
  ..on(
    'GET /me/businesses',
    FakeResponse.data({
      'items': [
        _business('b-1', 'Rahim Agro', myRole: 'OWNER', verified: true),
      ],
      'invitations': [
        if (withInvitation)
          {
            'business': _business('b-2', 'Karim Tailors'),
            'role': 'STAFF',
            'invitedAt': '2026-11-10T10:00:00Z',
          },
      ],
    }),
  );

Future<void> _open(
  WidgetTester tester,
  FakeApi api, {
  Widget home = const MyBusinessesScreen(),
  Locale locale = const Locale('en'),
}) => pumpRouted(
  tester,
  api: api,
  home: home,
  locale: locale,
  overrides: [meAs(KaajRole.worker)],
);

void main() {
  testWidgets('lists my businesses with role, badge and invitation', (
    tester,
  ) async {
    await _open(tester, _api());
    expect(find.text('Rahim Agro'), findsOneWidget);
    expect(find.text('Owner'), findsOneWidget);
    expect(find.text('Verified business'), findsOneWidget);
    expect(find.text('Karim Tailors'), findsOneWidget);
    expect(find.text('Staff'), findsOneWidget);
    expect(find.text('Create business'), findsOneWidget);
  });

  testWidgets('accepting an invitation posts and refreshes', (tester) async {
    final api = _api();
    api.on('POST /businesses/b-2/membership/accept', FakeResponse.data({}));
    await _open(tester, api);
    api.on(
      'GET /me/businesses',
      FakeResponse.data({
        'items': [
          _business('b-1', 'Rahim Agro', myRole: 'OWNER'),
          _business('b-2', 'Karim Tailors', myRole: 'STAFF'),
        ],
        'invitations': <Object>[],
      }),
    );
    await tester.tap(find.byKey(const ValueKey('invitation-accept-b-2')));
    await tester.pumpAndSettle();
    expect(api.called('POST /businesses/b-2/membership/accept'), hasLength(1));
    expect(find.text('You are now a member of this business.'), findsOneWidget);
    expect(find.byKey(const ValueKey('invitation-b-2')), findsNothing);
  });

  testWidgets('declining an invitation leaves; a refusal is explained', (
    tester,
  ) async {
    final api = _api()
      ..on(
        'DELETE /businesses/b-2/membership',
        FakeResponse.error(409, 'LAST_OWNER'),
      );
    await _open(tester, api);
    await tester.tap(find.byKey(const ValueKey('invitation-decline-b-2')));
    await tester.pumpAndSettle();
    expect(api.called('DELETE /businesses/b-2/membership'), hasLength(1));
    expect(find.byType(SnackBar), findsOneWidget);
    expect(find.byKey(const ValueKey('invitation-b-2')), findsOneWidget);
  });

  testWidgets('empty list offers to create a business', (tester) async {
    final api = FakeApi()
      ..on(
        'GET /me/businesses',
        FakeResponse.data({'items': <Object>[], 'invitations': <Object>[]}),
      );
    await _open(tester, api);
    expect(find.text('No businesses yet'), findsOneWidget);
    await tester.tap(find.text('Create business').last);
    await tester.pumpAndSettle();
    expect(find.text('route:/businesses/new'), findsOneWidget);
  });

  testWidgets('a load error retries', (tester) async {
    final api = FakeApi()
      ..on('GET /me/businesses', FakeResponse.error(500, 'INTERNAL'));
    await _open(tester, api);
    expect(find.textContaining('Could not load your businesses'), findsWidgets);
    api.on(
      'GET /me/businesses',
      FakeResponse.data({
        'items': [_business('b-1', 'Rahim Agro', myRole: 'OWNER')],
        'invitations': <Object>[],
      }),
    );
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(find.text('Rahim Agro'), findsOneWidget);
  });

  testWidgets('pull to refresh reloads the list', (tester) async {
    final api = _api(withInvitation: false);
    await _open(tester, api);
    await tester.drag(find.text('Rahim Agro'), const Offset(0, 400));
    await tester.pumpAndSettle();
    expect(api.called('GET /me/businesses').length, greaterThanOrEqualTo(2));
  });

  testWidgets('My activity section links collaboration and partners (bn)', (
    tester,
  ) async {
    await _open(
      tester,
      _api(),
      home: const Scaffold(body: MyBusinessSection()),
      locale: const Locale('bn'),
    );
    expect(find.text('সহযোগিতার অনুরোধ'), findsOneWidget);
    expect(find.text('অংশীদার খুঁজুন'), findsOneWidget);
    expect(find.text('আমার ব্যবসাগুলো'), findsOneWidget);
    expect(find.text('মালিক'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('my-business-partners')));
    await tester.pumpAndSettle();
    expect(find.text('route:/partners'), findsOneWidget);
  });
}
