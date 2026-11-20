import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/features/community/presentation/group_members_screen.dart';
import 'package:kaaj/features/community/presentation/group_screens.dart';
import 'package:kaaj/features/community/presentation/my_community_section.dart';
import 'package:kaaj/features/explore/explore_screen.dart';
import 'package:kaaj/features/onboarding/domain/onboarding_state.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';

Map<String, dynamic> _group({
  String id = 'g1',
  String name = 'Kazla tailors',
  bool womenOnly = false,
  Map<String, dynamic>? membership,
  int memberCount = 12,
}) => {
  'id': id,
  'name': name,
  'description': 'Tailors helping each other.',
  'visibility': 'PUBLIC',
  'womenOnly': womenOnly,
  'area': {'id': 'area-1', 'nameEn': 'Kazla', 'nameBn': 'কাজলা'},
  'category': null,
  'memberCount': memberCount,
  'myMembership': membership,
  'status': 'ACTIVE',
  'createdAt': '2026-11-01T10:00:00.000Z',
};

const _moderator = {'role': 'MODERATOR', 'status': 'ACTIVE', 'invited': false};

Map<String, dynamic> _member(
  String userId,
  String name, {
  String role = 'MEMBER',
  String status = 'ACTIVE',
  String? kind,
}) => {
  'id': 'm-$userId',
  'userId': userId,
  'displayName': name,
  'role': role,
  'status': status,
  'kind': kind,
  'joinedAt': status == 'ACTIVE' ? '2026-11-02T10:00:00.000Z' : null,
};

void main() {
  group('explore community', () {
    testWidgets('searches with the Explore box, filters and pages', (
      tester,
    ) async {
      final api = FakeApi()
        ..onRequest('GET /community/groups', (request) {
          if (request.query['cursor'] == 'g1') {
            return FakeResponse.data({
              'items': [_group(id: 'g2', name: 'Rickshaw owners')],
              'nextCursor': null,
            });
          }
          return FakeResponse.data({
            'items': [_group()],
            'nextCursor': 'g1',
          });
        });
      await pumpRouted(
        tester,
        api: api,
        home: const ExploreScreen(initial: ExploreSection.community),
        size: const Size(400, 1400),
        overrides: [meAs(KaajRole.worker)],
      );
      expect(find.text('Kazla tailors'), findsOneWidget);
      expect(api.called('GET /community/groups').first.query, isEmpty);

      await tester.tap(find.byKey(const ValueKey('groups-more')));
      await tester.pumpAndSettle();
      expect(find.text('Rickshaw owners'), findsOneWidget);

      await tester.enterText(find.byKey(const ValueKey('explore-search')), 't');
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pumpAndSettle();
      // One letter is not sent.
      expect(api.requests.where((r) => r.query.containsKey('q')), isEmpty);
      await tester.enterText(
        find.byKey(const ValueKey('explore-search')),
        'tailor',
      );
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('groups-near-me')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('groups-women-only')));
      await tester.pumpAndSettle();
      expect(api.called('GET /community/groups').last.query, {
        'q': 'tailor',
        'locationId': 'area-1',
        'womenOnly': 'true',
      });

      await tester.tap(find.byKey(const ValueKey('group-g1')));
      await tester.pumpAndSettle();
      expect(find.text('route:/community/groups/g1'), findsOneWidget);
    });

    testWidgets('an empty search and a load error', (tester) async {
      final api = FakeApi()
        ..on(
          'GET /community/groups',
          FakeResponse.data({'items': [], 'nextCursor': null}),
        );
      await pumpRouted(
        tester,
        api: api,
        home: const ExploreScreen(initial: ExploreSection.community),
        overrides: [meAs(KaajRole.worker)],
      );
      expect(find.text('No groups yet'), findsOneWidget);

      api.on('GET /community/groups', FakeResponse.error(500, 'INTERNAL'));
      await tester.fling(
        find.text('No groups yet'),
        const Offset(0, 400),
        1000,
      );
      await tester.pumpAndSettle();
      expect(find.text('Could not load the groups.'), findsOneWidget);
    });
  });

  group('group detail', () {
    testWidgets('a public group is joined at once', (tester) async {
      final api = FakeApi()
        ..on('GET /community/groups/g1', FakeResponse.data(_group()))
        ..on(
          'POST /community/groups/g1/join',
          FakeResponse.data(
            _group(
              membership: {
                'role': 'MEMBER',
                'status': 'ACTIVE',
                'invited': false,
              },
            ),
          ),
        );
      await pumpRouted(
        tester,
        api: api,
        home: const GroupDetailScreen(groupId: 'g1'),
        size: const Size(400, 1400),
      );
      expect(find.text('12 members'), findsOneWidget);
      api.on(
        'GET /community/groups/g1',
        FakeResponse.data(
          _group(
            membership: {
              'role': 'MEMBER',
              'status': 'ACTIVE',
              'invited': false,
            },
          ),
        ),
      );
      await tester.tap(find.byKey(const ValueKey('group-join')));
      await tester.pumpAndSettle();
      expect(find.text('You joined the group.'), findsOneWidget);
      expect(find.byKey(const ValueKey('group-chat')), findsOneWidget);
      expect(find.byKey(const ValueKey('group-leave')), findsOneWidget);
    });

    testWidgets('a women-only group asks, then refuses a non-female profile', (
      tester,
    ) async {
      final api = FakeApi()
        ..on(
          'GET /community/groups/g1',
          FakeResponse.data(_group(womenOnly: true)),
        )
        ..on(
          'POST /community/groups/g1/join',
          FakeResponse.data(
            _group(
              womenOnly: true,
              membership: {
                'role': 'MEMBER',
                'status': 'PENDING',
                'invited': false,
              },
            ),
          ),
        );
      await pumpRouted(
        tester,
        api: api,
        home: const GroupDetailScreen(groupId: 'g1'),
        size: const Size(400, 1400),
      );
      expect(find.text('Ask to join'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('group-join')));
      await tester.pumpAndSettle();
      expect(
        find.text(
          'Request sent. You will be told when a moderator approves it.',
        ),
        findsOneWidget,
      );

      api.on(
        'POST /community/groups/g1/join',
        FakeResponse.error(409, 'WOMEN_ONLY'),
      );
      await tester.tap(find.byKey(const ValueKey('group-join')));
      await tester.pumpAndSettle();
      expect(
        find.text(
          'This is a women-only group. You can join if your profile gender is female.',
        ),
        findsOneWidget,
      );
    });

    testWidgets('renders in Bangla; a private group is not available', (
      tester,
    ) async {
      final api = FakeApi()
        ..on('GET /community/groups/g1', FakeResponse.data(_group()));
      await pumpRouted(
        tester,
        api: api,
        home: const GroupDetailScreen(groupId: 'g1'),
        locale: const Locale('bn'),
      );
      expect(find.text('দলে যোগ দিন'), findsOneWidget);
      expect(find.text('১২ জন সদস্য'), findsOneWidget);

      await pumpRouted(
        tester,
        api: FakeApi(),
        home: const GroupDetailScreen(groupId: 'private'),
      );
      expect(find.text('This is not available'), findsOneWidget);
    });
  });

  group('members', () {
    testWidgets('a moderator approves a request and changes a role', (
      tester,
    ) async {
      final api = FakeApi()
        ..on(
          'GET /community/groups/g1',
          FakeResponse.data(_group(membership: _moderator)),
        )
        ..onRequest(
          'GET /community/groups/g1/members',
          (request) => request.query['status'] == 'PENDING'
              ? FakeResponse.data({
                  'items': [
                    _member(
                      'u-3',
                      'Mina R.',
                      status: 'PENDING',
                      kind: 'REQUEST',
                    ),
                  ],
                  'nextCursor': null,
                })
              : FakeResponse.data({
                  'items': [_member('u-2', 'Salma K.')],
                  'nextCursor': null,
                }),
        )
        ..on(
          'POST /community/groups/g1/members/u-3/approve',
          FakeResponse.data({'items': [], 'nextCursor': null}),
        )
        ..on(
          'PATCH /community/groups/g1/members/u-2',
          FakeResponse.error(409, 'LAST_MODERATOR'),
        );
      await pumpRouted(
        tester,
        api: api,
        home: const GroupMembersScreen(groupId: 'g1'),
        size: const Size(400, 1200),
      );
      expect(find.text('Salma K.'), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('member-menu-u-2')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Make ambassador'));
      await tester.pumpAndSettle();
      expect(api.called('PATCH /community/groups/g1/members/u-2').single.data, {
        'role': 'AMBASSADOR',
      });
      expect(
        find.text('A group needs at least one moderator. Add another first.'),
        findsOneWidget,
      );

      await tester.tap(find.text('Pending'));
      await tester.pumpAndSettle();
      expect(find.text('Mina R.'), findsOneWidget);
      expect(find.text('Wants to join'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('member-approve-u-3')));
      await tester.pumpAndSettle();
      expect(
        api.called('POST /community/groups/g1/members/u-3/approve'),
        hasLength(1),
      );
      expect(find.text('Request approved.'), findsOneWidget);
    });

    testWidgets('a member sees no moderator actions', (tester) async {
      final api = FakeApi()
        ..on(
          'GET /community/groups/g1',
          FakeResponse.data(
            _group(
              membership: {
                'role': 'MEMBER',
                'status': 'ACTIVE',
                'invited': false,
              },
            ),
          ),
        )
        ..on(
          'GET /community/groups/g1/members',
          FakeResponse.data({
            'items': [_member('u-2', 'Salma K.', role: 'MODERATOR')],
            'nextCursor': null,
          }),
        );
      await pumpRouted(
        tester,
        api: api,
        home: const GroupMembersScreen(groupId: 'g1'),
      );
      expect(find.text('Moderator'), findsOneWidget);
      expect(find.byKey(const ValueKey('member-menu-u-2')), findsNothing);
      expect(find.byKey(const ValueKey('members-invite')), findsNothing);
    });
  });

  testWidgets('a moderator posts an announcement', (tester) async {
    final posted = {
      'id': 'a1',
      'body': 'Meeting on Friday at 4',
      'postedBy': {'userId': 'user-1', 'displayName': 'Rahim'},
      'createdAt': DateTime.now().toUtc().toIso8601String(),
    };
    final api = FakeApi()
      ..on(
        'GET /community/groups/g1',
        FakeResponse.data(_group(membership: _moderator)),
      )
      ..on(
        'GET /community/groups/g1/announcements',
        FakeResponse.data({'items': []}),
      )
      ..on(
        'POST /community/groups/g1/announcements',
        FakeResponse.data({
          'items': [posted],
        }),
      );
    await pumpRouted(
      tester,
      api: api,
      home: const GroupAnnouncementsScreen(groupId: 'g1'),
    );
    expect(find.text('No announcements yet'), findsOneWidget);
    api.on(
      'GET /community/groups/g1/announcements',
      FakeResponse.data({
        'items': [posted],
      }),
    );
    await tester.enterText(
      find.byKey(const ValueKey('announcement-body')),
      'Meeting on Friday at 4',
    );
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('announcement-post')));
    await tester.pumpAndSettle();
    expect(api.called('POST /community/groups/g1/announcements').single.data, {
      'body': 'Meeting on Friday at 4',
    });
    expect(find.text('Meeting on Friday at 4'), findsOneWidget);
  });

  testWidgets('starting a group explains identity refusals', (tester) async {
    final api = FakeApi()
      ..on(
        'POST /community/groups',
        FakeResponse.error(409, 'IDENTITY_REQUIRED'),
      );
    await pumpRouted(
      tester,
      api: api,
      home: const GroupFormScreen(),
      size: const Size(400, 1400),
    );
    await tester.enterText(
      find.byKey(const ValueKey('group-name')),
      'Kazla tailors',
    );
    await tester.tap(find.byKey(const ValueKey('group-women-only')));
    await tester.tap(find.byKey(const ValueKey('group-save')));
    await tester.pumpAndSettle();
    expect(api.called('POST /community/groups').single.data, {
      'name': 'Kazla tailors',
      'visibility': 'PUBLIC',
      'womenOnly': true,
    });
    expect(
      find.text(
        'Verify your identity (NID and selfie) before starting a group.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('my activity shows community counts', (tester) async {
    final api = FakeApi()
      ..on(
        'GET /introductions',
        FakeResponse.data({'items': [], 'nextCursor': null}),
      )
      ..on(
        'GET /sessions',
        FakeResponse.data({'items': [], 'nextCursor': null}),
      )
      ..on(
        'GET /me/community/groups',
        FakeResponse.data({
          'items': [
            _group(membership: _moderator),
            _group(
              id: 'g2',
              name: 'Rickshaw owners',
              membership: {
                'role': 'MEMBER',
                'status': 'PENDING',
                'invited': true,
              },
            ),
          ],
        }),
      );
    await pumpRouted(
      tester,
      api: api,
      home: const Scaffold(body: MyCommunitySection()),
      size: const Size(400, 1600),
    );
    expect(find.text('Member: 1 · Pending: 1'), findsOneWidget);
    expect(find.text('Invited'), findsOneWidget);
    await tester.tap(find.text('All groups'));
    await tester.pumpAndSettle();
    expect(find.text('route:/community/groups'), findsOneWidget);
  });
}
