import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/features/business/presentation/business_members_screen.dart';
import 'package:kaaj/features/onboarding/domain/onboarding_state.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';

Map<String, dynamic> _business(String role) => {
  'id': 'b-1',
  'name': 'Rahim Agro',
  'stage': 'INFORMAL',
  'isPublic': true,
  'status': 'ACTIVE',
  'myRole': role,
};

Map<String, dynamic> _member(
  String userId,
  String name,
  String role, {
  String status = 'ACTIVE',
}) => {
  'userId': userId,
  'displayName': name,
  'role': role,
  'status': status,
  'invitedAt': '2026-11-01T10:00:00Z',
  'acceptedAt': status == 'ACTIVE' ? '2026-11-02T10:00:00Z' : null,
};

Map<String, dynamic> _worker(String id, String name, String skill) => {
  'id': id,
  'displayName': name,
  'trustLevel': 'IDENTITY',
  'ratingAverage': '4.5',
  'area': {'nameEn': 'Boalia', 'nameBn': 'বোয়ালিয়া'},
  'skills': [
    {'id': 's-$id', 'nameBn': skill, 'nameEn': skill, 'level': 'GOOD'},
  ],
};

FakeApi _api(String role) => FakeApi()
  ..on('GET /businesses/b-1', FakeResponse.data(_business(role)))
  ..on(
    'GET /businesses/b-1/members',
    FakeResponse.data({
      'items': [
        _member('user-1', 'Rahim', 'OWNER'),
        _member('u-2', 'Karim', 'STAFF'),
        _member('u-3', 'Salma', 'STAFF', status: 'INVITED'),
      ],
    }),
  );

Future<void> _open(
  WidgetTester tester,
  FakeApi api, {
  Locale locale = const Locale('en'),
}) => pumpRouted(
  tester,
  api: api,
  home: const BusinessMembersScreen(businessId: 'b-1'),
  locale: locale,
  overrides: [meAs(KaajRole.worker)],
);

void main() {
  testWidgets('the owner sees roles and changes one', (tester) async {
    final api = _api('OWNER')
      ..on(
        'PATCH /businesses/b-1/members/u-2',
        FakeResponse.data({
          'items': [
            _member('user-1', 'Rahim', 'OWNER'),
            _member('u-2', 'Karim', 'MANAGER'),
          ],
        }),
      );
    await _open(tester, api);
    expect(find.text('Rahim (You)'), findsOneWidget);
    expect(find.text('Karim'), findsOneWidget);
    expect(find.text('Invited'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('member-menu-u-2')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Make: Manager'));
    await tester.pumpAndSettle();
    expect(api.called('PATCH /businesses/b-1/members/u-2').single.data, {
      'role': 'MANAGER',
    });
  });

  testWidgets('the last owner cannot step down: reason shown', (tester) async {
    final api = _api('OWNER')
      ..on(
        'PATCH /businesses/b-1/members/user-1',
        FakeResponse.error(409, 'LAST_OWNER'),
      );
    await _open(tester, api);
    await tester.tap(find.byKey(const ValueKey('member-menu-user-1')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Make: Staff'));
    await tester.pumpAndSettle();
    expect(
      find.text(
        'A business needs at least one owner. Add another owner first.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('the owner removes a member after confirming', (tester) async {
    final api = _api('OWNER')
      ..on(
        'DELETE /businesses/b-1/members/u-2',
        FakeResponse.data({
          'items': [_member('user-1', 'Rahim', 'OWNER')],
        }),
      );
    await _open(tester, api);
    await tester.tap(find.byKey(const ValueKey('member-menu-u-2')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Remove'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('confirm-action')));
    await tester.pumpAndSettle();
    expect(api.called('DELETE /businesses/b-1/members/u-2'), hasLength(1));
  });

  testWidgets('the owner invites a person found by search', (tester) async {
    final api = _api('OWNER')
      ..on(
        'GET /users/workers',
        FakeResponse.data({
          'items': [
            _worker('u-2', 'Karim', 'Packing'),
            _worker('u-7', 'Nasima', 'Sewing'),
            _worker('u-8', 'Jamal', 'Driving'),
          ],
        }),
      )
      ..on(
        'POST /businesses/b-1/members',
        FakeResponse.data({'items': <Object>[]}),
      );
    await _open(tester, api);
    await tester.tap(find.byKey(const ValueKey('member-invite')));
    await tester.pumpAndSettle();
    // Existing members are left out.
    expect(find.byKey(const ValueKey('pick-u-2')), findsNothing);
    await tester.enterText(find.byKey(const ValueKey('member-search')), 'sew');
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('pick-u-8')), findsNothing);
    await tester.tap(find.byKey(const ValueKey('pick-u-7')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('invite-role-MANAGER')));
    await tester.pumpAndSettle();
    expect(api.called('POST /businesses/b-1/members').single.data, {
      'userId': 'u-7',
      'role': 'MANAGER',
    });
    expect(
      find.text('Invitation sent. They will get a notification.'),
      findsOneWidget,
    );
  });

  testWidgets('staff see the list without controls (bn)', (tester) async {
    await _open(tester, _api('STAFF'), locale: const Locale('bn'));
    expect(find.text('সদস্য'), findsOneWidget);
    expect(find.text('আমন্ত্রিত'), findsOneWidget);
    expect(find.byKey(const ValueKey('member-menu-u-2')), findsNothing);
    expect(find.byKey(const ValueKey('member-invite')), findsNothing);
  });

  testWidgets('a load error offers a retry', (tester) async {
    final api = _api('OWNER')
      ..on('GET /businesses/b-1/members', FakeResponse.error(500, 'INTERNAL'));
    await _open(tester, api);
    expect(find.text('Try again'), findsOneWidget);
  });
}
