import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/features/ideas/presentation/ideas_explore.dart';
import 'package:kaaj/features/ideas/presentation/my_ideas_section.dart';
import 'package:kaaj/features/onboarding/domain/onboarding_state.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';

Map<String, dynamic> _card({
  String id = 'idea-1',
  String title = 'Solar dryer for mangoes',
  Map<String, dynamic>? extra,
}) => {
  'id': id,
  'title': title,
  'summary': 'Dry mangoes with the sun to sell all year.',
  'category': {
    'id': 'sec-1',
    'slug': 'agriculture',
    'nameEn': 'Agriculture',
    'nameBn': 'কৃষি',
  },
  'area': {'id': 'area-1', 'nameEn': 'Boalia', 'nameBn': 'বোয়ালিয়া'},
  'stage': 'VALIDATING',
  'stageLabel': {'en': 'Validating', 'bn': 'যাচাই চলছে'},
  'owner': {
    'userId': 'owner-1',
    'displayName': 'Karim H.',
    'identityVerified': true,
  },
  'roles': [
    {
      'id': 'role-1',
      'roleType': 'TECHNICAL',
      'roleLabel': {'en': 'Technical partner', 'bn': 'কারিগরি অংশীদার'},
      'title': null,
      'description': null,
      'timeCommitment': 'PART_TIME',
      'arrangement': 'EQUITY_TO_DISCUSS',
      'status': 'OPEN',
      'skills': [],
    },
  ],
  'teamSize': 2,
  'myRelation': null,
  'canViewDetails': false,
  'createdAt': '2026-11-10T04:00:00Z',
  'updatedAt': '2026-11-10T04:00:00Z',
  'someNewField': 42,
  ...?extra,
};

const _sectors = {
  'items': [
    {
      'id': 'sec-1',
      'parentId': null,
      'slug': 'agriculture',
      'nameEn': 'Agriculture',
      'nameBn': 'কৃষি',
      'icon': null,
    },
    {
      'id': 'sec-2',
      'parentId': null,
      'slug': 'technology',
      'nameEn': 'Technology',
      'nameBn': 'প্রযুক্তি',
      'icon': null,
    },
  ],
};

void main() {
  group('Explore, Ideas', () {
    testWidgets('lists cards, filters, pages and searches on the server', (
      tester,
    ) async {
      final api = FakeApi()
        ..on('GET /business-categories', FakeResponse.data(_sectors))
        ..onRequest('GET /ideas', (request) {
          final query = request.query;
          if (query['cursor'] == 'c2') {
            return FakeResponse.data({
              'items': [_card(id: 'idea-3', title: 'Fish feed from waste')],
              'nextCursor': null,
            });
          }
          if (query['categoryId'] == 'sec-2') {
            return FakeResponse.data({
              'items': [_card(id: 'idea-2', title: 'Repair booking app')],
              'nextCursor': null,
            });
          }
          return FakeResponse.data({
            'items': [_card()],
            'nextCursor': 'c2',
          });
        });
      await pumpRouted(
        tester,
        api: api,
        home: const Scaffold(body: IdeasExploreBody()),
        overrides: [meAs(KaajRole.worker)],
      );

      expect(find.text('Solar dryer for mangoes'), findsOneWidget);
      expect(find.text('Validating'), findsOneWidget);
      expect(find.text('Agriculture'), findsOneWidget);
      expect(find.text('Karim H.'), findsOneWidget);
      expect(find.text('Identity verified'), findsOneWidget);
      expect(find.text('Looking for: Technical partner'), findsOneWidget);
      expect(find.text('Team size: 2'), findsOneWidget);

      // Paging.
      await tester.tap(find.byKey(const ValueKey('ideas-load-more')));
      await tester.pumpAndSettle();
      expect(find.text('Fish feed from waste'), findsOneWidget);
      expect(api.called('GET /ideas').last.query['cursor'], 'c2');
      expect(find.byKey(const ValueKey('ideas-load-more')), findsNothing);

      // Sector filter.
      await tester.tap(find.byKey(const ValueKey('ideas-filter-sector')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('ideas-option-sec-2')));
      await tester.pumpAndSettle();
      expect(find.text('Repair booking app'), findsOneWidget);
      expect(find.text('Solar dryer for mangoes'), findsNothing);
      expect(api.called('GET /ideas').last.query['categoryId'], 'sec-2');

      // In my area and stage.
      await tester.ensureVisible(find.byKey(const ValueKey('ideas-near-me')));
      await tester.tap(find.byKey(const ValueKey('ideas-near-me')));
      await tester.pumpAndSettle();
      expect(api.called('GET /ideas').last.query['locationId'], 'area-1');
      await tester.ensureVisible(
        find.byKey(const ValueKey('ideas-filter-stage')),
      );
      await tester.tap(find.byKey(const ValueKey('ideas-filter-stage')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('ideas-option-PILOT')));
      await tester.pumpAndSettle();
      expect(api.called('GET /ideas').last.query['stage'], 'PILOT');

      // Role type.
      await tester.ensureVisible(
        find.byKey(const ValueKey('ideas-filter-role')),
      );
      await tester.tap(find.byKey(const ValueKey('ideas-filter-role')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('ideas-option-MARKETING')));
      await tester.pumpAndSettle();
      expect(api.called('GET /ideas').last.query['roleType'], 'MARKETING');

      // Opening a card goes to the detail.
      await tester.tap(find.text('Repair booking app'));
      await tester.pumpAndSettle();
      expect(find.text('route:/ideas/idea-2'), findsOneWidget);
    });

    testWidgets('sends the Explore search after two characters', (
      tester,
    ) async {
      final api = FakeApi()
        ..on('GET /business-categories', FakeResponse.data(_sectors))
        ..on('GET /ideas', FakeResponse.data({'items': <Object>[]}));
      final query = ValueNotifier('');
      addTearDown(query.dispose);
      await pumpRouted(
        tester,
        api: api,
        home: Scaffold(
          body: ValueListenableBuilder<String>(
            valueListenable: query,
            builder: (_, value, _) => IdeasExploreBody(searchQuery: value),
          ),
        ),
      );
      expect(find.text('No ideas found'), findsOneWidget);
      expect(api.called('GET /ideas').single.query.containsKey('q'), isFalse);

      query.value = 'm';
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pumpAndSettle();
      expect(api.called('GET /ideas'), hasLength(1));

      query.value = 'mango';
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pumpAndSettle();
      expect(api.called('GET /ideas').last.query['q'], 'mango');
    });

    testWidgets('shows the server refusal and retries', (tester) async {
      final api = FakeApi()
        ..on('GET /business-categories', FakeResponse.data(_sectors))
        ..on('GET /ideas', FakeResponse.error(500, 'INTERNAL'));
      await pumpRouted(
        tester,
        api: api,
        home: const Scaffold(body: IdeasExploreBody()),
      );
      expect(find.textContaining('Could not load the ideas.'), findsOneWidget);
      api.on(
        'GET /ideas',
        FakeResponse.data({
          'items': [_card()],
        }),
      );
      await tester.tap(find.text('Try again'));
      await tester.pumpAndSettle();
      expect(find.text('Solar dryer for mangoes'), findsOneWidget);
    });

    testWidgets('renders in Bangla', (tester) async {
      final api = FakeApi()
        ..on('GET /business-categories', FakeResponse.data(_sectors))
        ..on(
          'GET /ideas',
          FakeResponse.data({
            'items': [_card()],
          }),
        );
      await pumpRouted(
        tester,
        api: api,
        locale: const Locale('bn'),
        home: const Scaffold(body: IdeasExploreBody()),
      );
      expect(find.text('যাচাই চলছে'), findsOneWidget);
      expect(find.text('কৃষি'), findsOneWidget);
      expect(find.text('পরিচয় যাচাই করা'), findsOneWidget);
    });
  });

  group('My activity, Ideas', () {
    testWidgets('owned, team and asked-to-see ideas', (tester) async {
      final api = FakeApi()
        ..on(
          'GET /me/ideas',
          FakeResponse.data({
            'owned': [
              _card(
                id: 'idea-mine',
                title: 'Rooftop vegetable kits',
                extra: {
                  'myRelation': 'OWNER',
                  'canViewDetails': true,
                  'visibility': 'PRIVATE',
                  'status': 'HIDDEN',
                  'hiddenReason': 'Spam',
                  'convertedBusinessId': null,
                },
              ),
              _card(
                id: 'idea-conv',
                title: 'Tea stall chain',
                extra: {
                  'myRelation': 'OWNER',
                  'stage': 'CONVERTED',
                  'visibility': 'SUMMARY_PUBLIC',
                  'status': 'ACTIVE',
                  'convertedBusinessId': 'biz-1',
                },
              ),
            ],
            'team': [
              _card(
                id: 'idea-team',
                title: 'Jute bags',
                extra: {'myRelation': 'MEMBER'},
              ),
            ],
          }),
        )
        ..on(
          'GET /me/idea-access',
          FakeResponse.data({
            'items': [
              {
                'ideaId': 'idea-asked',
                'title': 'Cold storage share',
                'summary': 'Shared cold room for small farmers.',
                'status': 'REQUESTED',
                'requestedAt': '2026-11-12T04:00:00Z',
                'canViewDetails': false,
              },
            ],
          }),
        );
      await pumpRouted(
        tester,
        api: api,
        size: const Size(400, 2400),
        home: const Scaffold(body: MyIdeasSection()),
      );
      expect(find.text('Rooftop vegetable kits'), findsOneWidget);
      expect(find.text('Hidden by a moderator'), findsOneWidget);
      expect(find.text('Became a business'), findsOneWidget);
      expect(find.text('Private idea'), findsOneWidget);
      expect(find.text('Teams I am on'), findsOneWidget);
      expect(find.text('Jute bags'), findsOneWidget);
      expect(find.text('Ideas I asked to see'), findsOneWidget);
      expect(find.text('Cold storage share'), findsOneWidget);
      expect(find.text('Waiting for approval'), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('ideas-new')));
      await tester.pumpAndSettle();
      expect(find.text('route:/ideas/new'), findsOneWidget);
    });

    testWidgets('empty state and load error', (tester) async {
      final api = FakeApi()
        ..on('GET /me/ideas', FakeResponse.data({'owned': [], 'team': []}))
        ..on('GET /me/idea-access', FakeResponse.data({'items': []}));
      await pumpRouted(
        tester,
        api: api,
        home: const Scaffold(body: MyIdeasSection()),
      );
      expect(find.text('No ideas yet'), findsOneWidget);

      api.on('GET /me/ideas', FakeResponse.error(500, 'INTERNAL'));
      await tester.fling(
        find.byType(ListView).first,
        const Offset(0, 400),
        1000,
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('Could not load your ideas.'), findsOneWidget);
    });
  });
}
