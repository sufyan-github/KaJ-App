import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/features/catalog/domain/entities/catalog_skill.dart';
import 'package:kaaj/features/catalog/presentation/controllers/catalog_providers.dart';
import 'package:kaaj/features/ideas/presentation/idea_access_screens.dart';
import 'package:kaaj/features/ideas/presentation/idea_detail_screen.dart';
import 'package:kaaj/features/ideas/presentation/idea_role_screens.dart';
import 'package:kaaj/features/ideas/presentation/idea_team_screens.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';

Map<String, dynamic> _role() => {
  'id': 'role-1',
  'roleType': 'TECHNICAL',
  'roleLabel': {'en': 'Technical partner', 'bn': 'কারিগরি অংশীদার'},
  'title': null,
  'description': null,
  'timeCommitment': 'PART_TIME',
  'arrangement': null,
  'status': 'OPEN',
  'skills': [
    {'id': 'skill-1', 'nameEn': 'Flutter', 'nameBn': 'ফ্লাটার'},
  ],
};

Map<String, dynamic> _owned({bool converted = false}) => {
  'id': 'idea-1',
  'title': 'Solar dryer for mangoes',
  'summary': 'Dry mangoes with the sun to sell all year.',
  'category': {'id': 'sec-1', 'nameEn': 'Agriculture', 'nameBn': 'কৃষি'},
  'area': null,
  'stage': converted ? 'CONVERTED' : 'PILOT',
  'stageLabel': {'en': 'Pilot', 'bn': 'পাইলট'},
  'owner': {
    'userId': 'user-1',
    'displayName': 'Rahim',
    'identityVerified': true,
  },
  'roles': [_role()],
  'teamSize': 2,
  'myRelation': 'OWNER',
  'canViewDetails': true,
  'details': {
    'problem': 'Mangoes rot in the season.',
    'solution': 'A cheap solar dryer in each village.',
    'details': null,
  },
  'visibility': 'SUMMARY_PUBLIC',
  'aiConsent': false,
  'convertedBusinessId': converted ? 'biz-7' : null,
  'convertedAt': null,
  'status': 'ACTIVE',
  'hiddenReason': null,
};

Map<String, dynamic> _request(String status) => {
  'userId': 'user-9',
  'displayName': 'Nasima A.',
  'trustLevel': 'IDENTITY',
  'status': status,
  'message': 'I sell dried fruit in Dhaka.',
  'confidentialityAcceptedAt': '2026-11-19T04:00:00Z',
  'requestedAt': '2026-11-19T04:00:00Z',
  'approvedAt': null,
  'decidedAt': null,
  'revokedAt': null,
};

Future<void> _tapKey(WidgetTester tester, String key) async {
  await tester.ensureVisible(find.byKey(ValueKey(key)));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(ValueKey(key)));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('owner sees the tools and opens them', (tester) async {
    final api = FakeApi()..on('GET /ideas/idea-1', FakeResponse.data(_owned()));
    await pumpRouted(
      tester,
      api: api,
      home: const IdeaDetailScreen(ideaId: 'idea-1'),
      size: const Size(400, 2400),
    );
    expect(find.text('Mangoes rot in the season.'), findsOneWidget);
    expect(find.text('Summary open to all'), findsOneWidget);
    expect(find.byKey(const ValueKey('idea-report')), findsNothing);
    expect(find.byKey(const ValueKey('idea-interest-role-1')), findsNothing);
    await _tapKey(tester, 'idea-tool-access');
    expect(find.text('route:/ideas/idea-1/access'), findsOneWidget);
  });

  testWidgets('owner approves a request and revokes access', (tester) async {
    final api = FakeApi();
    api
      ..on(
        'GET /ideas/idea-1/access-requests',
        FakeResponse.data({
          'items': [_request('REQUESTED')],
        }),
      )
      ..onRequest('POST /ideas/idea-1/access-requests/user-9/approve', (_) {
        api.on(
          'GET /ideas/idea-1/access-requests',
          FakeResponse.data({
            'items': [_request('APPROVED')],
          }),
        );
        return FakeResponse.data({
          'items': [_request('APPROVED')],
        });
      })
      ..on(
        'POST /ideas/idea-1/access/user-9/revoke',
        FakeResponse.error(409, 'IDEA_ACCESS_TRANSITION_NOT_ALLOWED'),
      );
    await pumpRouted(
      tester,
      api: api,
      home: const IdeaAccessScreen(ideaId: 'idea-1'),
      size: const Size(400, 1600),
    );
    expect(find.text('Nasima A.'), findsOneWidget);
    expect(find.text('"I sell dried fruit in Dhaka."'), findsOneWidget);
    expect(find.text('Waiting access requests'), findsOneWidget);

    await _tapKey(tester, 'idea-approve-user-9');
    expect(
      api.called('POST /ideas/idea-1/access-requests/user-9/approve'),
      hasLength(1),
    );
    expect(find.text('People with access'), findsOneWidget);

    await _tapKey(tester, 'idea-revoke-user-9');
    await tester.tap(find.byKey(const ValueKey('idea-confirm')));
    await tester.pumpAndSettle();
    expect(api.called('POST /ideas/idea-1/access/user-9/revoke'), hasLength(1));
    expect(find.byType(SnackBar), findsOneWidget);
  });

  testWidgets('the access route is not available to others', (tester) async {
    final api = FakeApi();
    await pumpRouted(
      tester,
      api: api,
      home: const IdeaAccessScreen(ideaId: 'idea-1'),
    );
    expect(find.text('This idea is not available'), findsOneWidget);
    await tester.tap(find.text('Open the idea'));
    await tester.pumpAndSettle();
    expect(find.text('route:/ideas/idea-1'), findsOneWidget);
  });

  testWidgets('views log pages', (tester) async {
    final api = FakeApi();
    api.onRequest(
      'GET /ideas/idea-1/views',
      (request) => request.query['cursor'] == 'v2'
          ? FakeResponse.data({
              'items': [
                {
                  'id': 'view-2',
                  'viewerUserId': 'user-5',
                  'displayName': 'Jamal Uddin',
                  'basis': 'MEMBER',
                  'viewedAt': '2026-11-18T04:00:00Z',
                },
              ],
              'nextCursor': null,
            })
          : FakeResponse.data({
              'items': [
                {
                  'id': 'view-1',
                  'viewerUserId': 'user-9',
                  'displayName': 'Nasima Akter',
                  'basis': 'ACCESS',
                  'viewedAt': '2026-11-19T04:00:00Z',
                },
              ],
              'nextCursor': 'v2',
            }),
    );
    await pumpRouted(
      tester,
      api: api,
      home: const IdeaViewsScreen(ideaId: 'idea-1'),
    );
    expect(find.text('Nasima Akter'), findsOneWidget);
    expect(find.textContaining('With approved access'), findsOneWidget);
    await _tapKey(tester, 'idea-views-load-more');
    expect(find.text('Jamal Uddin'), findsOneWidget);
    expect(find.textContaining('As a team member'), findsOneWidget);
  });

  testWidgets('owner adds a role with skills', (tester) async {
    final api = FakeApi();
    api
      ..on('GET /ideas/idea-1', FakeResponse.data(_owned()))
      ..on('POST /ideas/idea-1/roles', FakeResponse.data(_role(), status: 201));
    await pumpRouted(
      tester,
      api: api,
      home: const IdeaRoleEditorScreen(ideaId: 'idea-1'),
      size: const Size(400, 2400),
      overrides: [
        catalogSkillsProvider.overrideWith(
          (ref) async => const [
            CatalogSkill(
              id: 'skill-1',
              slug: 'flutter',
              nameEn: 'Flutter',
              nameBn: 'ফ্লাটার',
              categoryId: 'cat-1',
            ),
            CatalogSkill(
              id: 'skill-2',
              slug: 'design',
              nameEn: 'Design',
              nameBn: 'নকশা',
              categoryId: 'cat-1',
            ),
          ],
        ),
      ],
    );
    await _tapKey(tester, 'idea-role-type-MARKETING');
    await tester.enterText(
      find.descendant(
        of: find.byKey(const ValueKey('idea-role-title')),
        matching: find.byType(EditableText),
      ),
      'Market seller',
    );
    await _tapKey(tester, 'idea-role-skills');
    await tester.tap(find.byKey(const ValueKey('idea-skill-skill-2')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('idea-skill-done')));
    await tester.pumpAndSettle();
    expect(find.text('Design'), findsOneWidget);
    await _tapKey(tester, 'idea-role-time-FLEXIBLE');
    await _tapKey(tester, 'idea-role-arrangement-PAID');
    await _tapKey(tester, 'idea-role-save');
    expect(api.called('POST /ideas/idea-1/roles').single.data, {
      'roleType': 'MARKETING',
      'title': 'Market seller',
      'skillIds': ['skill-2'],
      'timeCommitment': 'FLEXIBLE',
      'arrangement': 'PAID',
    });
  });

  testWidgets('role limit refusal shows the server copy', (tester) async {
    final api = FakeApi();
    api
      ..on('GET /ideas/idea-1', FakeResponse.data(_owned()))
      ..on(
        'POST /ideas/idea-1/roles',
        FakeResponse.error(409, 'IDEA_ROLE_LIMIT_REACHED'),
      );
    await pumpRouted(
      tester,
      api: api,
      home: const IdeaRoleEditorScreen(ideaId: 'idea-1'),
      size: const Size(400, 2400),
    );
    await _tapKey(tester, 'idea-role-save');
    expect(find.byKey(const ValueKey('idea-role-error')), findsOneWidget);
  });

  testWidgets('matches show the explanation and reasons (bn)', (tester) async {
    final api = FakeApi();
    api.on(
      'GET /ideas/idea-1/roles/role-1/matches',
      FakeResponse.data({
        'roleId': 'role-1',
        'explanation': {
          'source': 'FROM_KAAJ',
          'en': 'Suggested by KAAJ from skills and area.',
          'bn': 'দক্ষতা ও এলাকা দেখে KAAJ-এর পরামর্শ।',
        },
        'items': [
          {
            'userId': 'user-3',
            'displayName': 'Sumi K.',
            'trustLevel': 'SKILL',
            'area': {
              'id': 'area-1',
              'nameEn': 'Boalia',
              'nameBn': 'বোয়ালিয়া',
            },
            'score': 70,
            'matchedSkills': [
              {
                'id': 'skill-1',
                'nameEn': 'Flutter',
                'nameBn': 'ফ্লাটার',
                'verified': true,
              },
            ],
            'reasons': [
              {
                'code': 'SKILLS',
                'en': 'Has 1 of the skills',
                'bn': '১টি দক্ষতা মেলে',
                'points': 40,
              },
              {
                'code': 'SAME_AREA',
                'en': 'Same area',
                'bn': 'একই এলাকা',
                'points': 20,
              },
            ],
          },
        ],
      }),
    );
    await pumpRouted(
      tester,
      api: api,
      locale: const Locale('bn'),
      home: const IdeaRoleMatchesScreen(ideaId: 'idea-1', roleId: 'role-1'),
    );
    expect(find.text('KAAJ-এর পরামর্শ'), findsOneWidget);
    expect(find.text('দক্ষতা ও এলাকা দেখে KAAJ-এর পরামর্শ।'), findsOneWidget);
    expect(find.text('Sumi K.'), findsOneWidget);
    expect(find.text('১টি দক্ষতা মেলে'), findsOneWidget);
    expect(find.text('একই এলাকা'), findsOneWidget);
    expect(find.text('ফ্লাটার'), findsOneWidget);
  });

  testWidgets('owner adds a member from an agreed collaboration', (
    tester,
  ) async {
    Map<String, dynamic> team(List<Map<String, dynamic>> items) => {
      'notice': {
        'key': 'collaboration.notice.not_legal_partnership',
        'en': 'Not a legal partnership.',
        'bn': 'এটি আইনি অংশীদারি নয়।',
      },
      'owner': {'userId': 'user-1', 'displayName': 'Rahim'},
      'items': items,
    };
    final member = {
      'userId': 'user-3',
      'displayName': 'Sumi Khatun',
      'role': null,
      'roleLabel': 'App lead',
      'status': 'AGREED_IN_PRINCIPLE',
      'agreedInPrincipleAt': '2026-11-20T04:00:00Z',
      'collaborationRequestId': 'collab-1',
    };
    final api = FakeApi();
    api
      ..on('GET /ideas/idea-1', FakeResponse.data(_owned()))
      ..on('GET /ideas/idea-1/members', FakeResponse.data(team([])))
      ..on(
        'GET /collaboration-requests',
        FakeResponse.data({
          'items': [
            {
              'id': 'collab-1',
              'status': 'AGREED',
              'requester': {'userId': 'user-3', 'displayName': 'Sumi Khatun'},
              'subject': {'type': 'IDEA', 'id': 'idea-1', 'ideaRoleId': null},
              'message': 'I can build the app.',
            },
          ],
          'nextCursor': null,
        }),
      )
      ..onRequest('POST /ideas/idea-1/members', (_) {
        api.on('GET /ideas/idea-1/members', FakeResponse.data(team([member])));
        return FakeResponse.data(team([member]));
      });
    await pumpRouted(
      tester,
      api: api,
      home: const IdeaTeamScreen(ideaId: 'idea-1'),
      size: const Size(400, 1600),
    );
    expect(find.text('Not a legal partnership.'), findsOneWidget);
    final query = api.called('GET /collaboration-requests').single.query;
    expect(query, {
      'box': 'received',
      'subjectType': 'IDEA',
      'subjectId': 'idea-1',
      'status': 'AGREED',
    });
    await _tapKey(tester, 'idea-add-collab-1');
    await tester.enterText(
      find.byKey(const ValueKey('idea-member-label')),
      'App lead',
    );
    await tester.tap(find.byKey(const ValueKey('idea-member-confirm')));
    await tester.pumpAndSettle();
    expect(api.called('POST /ideas/idea-1/members').single.data, {
      'collaborationRequestId': 'collab-1',
      'roleLabel': 'App lead',
    });
    expect(find.byKey(const ValueKey('idea-member-user-3')), findsOneWidget);
    expect(find.byKey(const ValueKey('idea-add-collab-1')), findsNothing);
  });

  testWidgets('owner converts the idea to a business', (tester) async {
    final api = FakeApi();
    api
      ..on('GET /ideas/idea-1', FakeResponse.data(_owned()))
      ..on(
        'POST /ideas/idea-1/convert',
        FakeResponse.error(409, 'BUSINESS_LIMIT_REACHED'),
      );
    await pumpRouted(
      tester,
      api: api,
      home: const IdeaConvertScreen(ideaId: 'idea-1'),
      size: const Size(400, 1600),
    );
    expect(
      find.textContaining('invited to the business as staff'),
      findsOneWidget,
    );
    await _tapKey(tester, 'idea-convert-REGISTERED');
    await tester.enterText(
      find.descendant(
        of: find.byKey(const ValueKey('idea-convert-licence')),
        matching: find.byType(EditableText),
      ),
      'TL-123',
    );
    await _tapKey(tester, 'idea-convert-submit');
    await tester.tap(find.byKey(const ValueKey('idea-confirm')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('idea-convert-error')), findsOneWidget);

    api.on(
      'POST /ideas/idea-1/convert',
      FakeResponse.data({
        'idea': _owned(converted: true),
        'business': {'id': 'biz-7', 'name': 'Solar dryer for mangoes'},
      }),
    );
    await _tapKey(tester, 'idea-convert-submit');
    await tester.tap(find.byKey(const ValueKey('idea-confirm')));
    await tester.pumpAndSettle();
    expect(api.called('POST /ideas/idea-1/convert').last.data, {
      'stage': 'REGISTERED',
      'tradeLicenceNo': 'TL-123',
    });
    expect(find.text('route:/businesses/biz-7'), findsOneWidget);
  });
}
