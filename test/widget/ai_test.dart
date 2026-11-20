import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/features/ai/domain/ai_models.dart';
import 'package:kaaj/features/ai/presentation/ai_consent_screen.dart';
import 'package:kaaj/features/ai/presentation/ai_entry_tiles.dart';
import 'package:kaaj/features/ai/presentation/ai_suggestions.dart';
import 'package:kaaj/features/ai/presentation/growth_tips_screen.dart';
import 'package:kaaj/features/ai/presentation/idea_analysis_screen.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';

Map<String, dynamic> _status({
  bool enabled = true,
  bool accepted = true,
  bool subscribed = true,
  int ideaLeft = 3,
}) => {
  'enabled': enabled,
  'consent': {
    'required': true,
    'currentVersion': 1,
    'accepted': accepted,
    'acceptedVersion': accepted ? 1 : null,
    'acceptedAt': accepted ? '2026-11-20T03:00:00Z' : null,
  },
  'quotaResetsAt': '2026-11-20T18:00:00.000Z',
  'features': {
    'IDEA_ANALYSIS': {
      'dailyLimit': 3,
      'usedToday': 3 - ideaLeft,
      'remainingToday': ideaLeft,
      'requiresSubscription': true,
      'subscriptionActive': subscribed,
    },
    'OPPORTUNITY_SUGGESTIONS': {
      'dailyLimit': 10,
      'usedToday': 2,
      'remainingToday': 8,
      'requiresSubscription': false,
      'subscriptionActive': null,
    },
    'BUSINESS_GROWTH_TIPS': {
      'dailyLimit': 5,
      'usedToday': 0,
      'remainingToday': 5,
      'requiresSubscription': false,
      'subscriptionActive': null,
    },
  },
};

FakeResponse _error(int status, String code) => FakeResponse(status, {
  'error': {'code': code, 'message': 'Refused', 'requestId': 'req-1'},
});

const _analysis = {
  'ideaId': 'idea-1',
  'locale': 'en',
  'analyzedAt': '2026-11-20T09:12:00.000Z',
  'analysis': {
    'summary': 'A small tailoring unit can work in Boalia.',
    'feasibility': {'rating': 'HIGH', 'explanation': 'Skills are local.'},
    'localMarketFit': {
      'rating': 'MEDIUM',
      'explanation': 'Demand peaks before Eid.',
      'targetCustomers': ['Families'],
    },
    'startupCostsBdt': {
      'items': [
        {'item': 'Two sewing machines', 'minBdt': 30000, 'maxBdt': 45000},
      ],
      'totalMinBdt': 30000,
      'totalMaxBdt': 45000,
      'assumptions': 'Used machines.',
    },
    'risks': [
      {'risk': 'Late payments', 'severity': 'HIGH', 'mitigation': 'Deposit'},
    ],
    'nextSteps': [
      {'step': 'Talk to ten shops', 'timeframe': '2 weeks'},
    ],
    'kaajConnections': {
      'experts': [
        {'field': 'Garment pricing', 'why': 'Set fair prices'},
      ],
      'learning': <Object>[],
      'partners': <Object>[],
    },
  },
};

const _empty = {'ideaId': 'idea-1', 'analyzedAt': null, 'analysis': null};

void main() {
  group('entry points', () {
    for (final (name, response) in [
      ('AI is off', FakeResponse.data(_status(enabled: false))),
      ('an older server', FakeResponse.error(404, 'NOT_FOUND')),
    ]) {
      testWidgets('the Home card hides when $name', (tester) async {
        final api = FakeApi()..on('GET /ai/status', response);
        await pumpRouted(
          tester,
          api: api,
          home: const Scaffold(body: AiSuggestionsCard()),
        );
        expect(find.byKey(const ValueKey('ai-suggestions-card')), findsNothing);
      });
    }

    testWidgets('the Home card opens suggestions when AI is on', (
      tester,
    ) async {
      final api = FakeApi()..on('GET /ai/status', FakeResponse.data(_status()));
      await pumpRouted(
        tester,
        api: api,
        home: const Scaffold(body: AiSuggestionsCard()),
      );
      await tester.tap(find.byKey(const ValueKey('ai-suggestions-card')));
      await tester.pumpAndSettle();
      expect(find.text('route:/ai/suggestions'), findsOneWidget);
    });
  });

  for (final enabled in [true, false]) {
    testWidgets('settings and business AI tiles follow the switch '
        '(enabled: $enabled)', (tester) async {
      final api = FakeApi()
        ..on('GET /ai/status', FakeResponse.data(_status(enabled: enabled)));
      await pumpRouted(
        tester,
        api: api,
        home: const Scaffold(
          body: Column(
            children: [
              AiSettingsTile(),
              AiGrowthTipsTile(businessId: 'b-1'),
            ],
          ),
        ),
      );
      expect(
        find.byKey(const ValueKey('settings-ai')),
        enabled ? findsOneWidget : findsNothing,
      );
      expect(
        find.byKey(const ValueKey('business-ai-growth')),
        enabled ? findsOneWidget : findsNothing,
      );
      if (enabled) {
        await tester.tap(find.byKey(const ValueKey('business-ai-growth')));
        await tester.pumpAndSettle();
        expect(
          find.text('route:/ai/businesses/b-1/growth-tips'),
          findsOneWidget,
        );
      }
    });
  }

  group('consent', () {
    for (final language in ['en', 'bn']) {
      testWidgets('shows the text and records agreement ($language)', (
        tester,
      ) async {
        final api = FakeApi()
          ..on('GET /ai/status', FakeResponse.data(_status(accepted: false)))
          ..on('POST /ai/consent', FakeResponse.data({'accepted': true}));
        await pumpRouted(
          tester,
          api: api,
          home: const AiConsentScreen(),
          locale: Locale(language),
          size: const Size(400, 1600),
        );
        expect(
          find.textContaining(
            language == 'en'
                ? "KAAJ AI uses Anthropic's Claude model"
                : 'Anthropic-এর Claude মডেল',
          ),
          findsOneWidget,
        );
        await tester.tap(find.byKey(const ValueKey('ai-consent-accept')));
        await tester.pumpAndSettle();
        expect(api.called('POST /ai/consent').single.data, {'version': 1});
      });
    }

    testWidgets('withdraws after a confirm', (tester) async {
      final api = FakeApi()
        ..on('GET /ai/status', FakeResponse.data(_status()))
        ..on('DELETE /ai/consent', FakeResponse.data({'accepted': false}));
      await pumpRouted(
        tester,
        api: api,
        home: const AiConsentScreen(),
        size: const Size(400, 1600),
      );
      expect(find.byKey(const ValueKey('ai-consent-given')), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('ai-consent-withdraw')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('ai-withdraw-confirm')));
      await tester.pumpAndSettle();
      expect(api.called('DELETE /ai/consent'), hasLength(1));
      expect(find.text('AI is turned off.'), findsOneWidget);
    });

    testWidgets('a newer consent text than the app knows is not accepted', (
      tester,
    ) async {
      final status = _status(accepted: false);
      (status['consent'] as Map)['currentVersion'] = 2;
      final api = FakeApi()..on('GET /ai/status', FakeResponse.data(status));
      await pumpRouted(
        tester,
        api: api,
        home: const AiConsentScreen(),
        size: const Size(400, 1600),
      );
      expect(find.byKey(const ValueKey('ai-consent-accept')), findsNothing);
    });
  });

  group('suggestions', () {
    testWidgets('without consent the consent screen comes first', (
      tester,
    ) async {
      final api = FakeApi()
        ..on('GET /ai/status', FakeResponse.data(_status(accepted: false)));
      await pumpRouted(tester, api: api, home: const AiSuggestionsScreen());
      await tester.tap(find.byKey(const ValueKey('ai-suggest')));
      await tester.pumpAndSettle();
      expect(find.text('route:/ai/consent'), findsOneWidget);
      expect(api.called('POST /ai/opportunity-suggestions'), isEmpty);
    });

    testWidgets('lists ranked items with the quota and opens one', (
      tester,
    ) async {
      final api = FakeApi()
        ..on('GET /ai/status', FakeResponse.data(_status()))
        ..on(
          'POST /ai/opportunity-suggestions',
          FakeResponse.data({
            'source': 'AI',
            'summary': 'Start with the nearby tailoring job.',
            'items': [
              {
                'type': 'JOB',
                'id': 'job-7',
                'title': 'Blouse tailoring, 3 days',
                'area': {'nameEn': 'Boalia', 'nameBn': 'বোয়ালিয়া'},
                'score': 87,
                'reason': 'You already sew blouses.',
              },
              {
                'type': 'GROUP',
                'id': 'g-1',
                'title': 'Tailors of Boalia',
                'area': null,
                'score': 60,
                'reason': 'People with your skill.',
              },
            ],
          }),
        );
      await pumpRouted(
        tester,
        api: api,
        home: const AiSuggestionsScreen(),
        size: const Size(400, 1600),
      );
      expect(find.text('AI requests left today: 8/10'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('ai-suggest')));
      await tester.pumpAndSettle();
      expect(api.called('POST /ai/opportunity-suggestions').single.data, {
        'locale': 'en',
      });
      expect(find.text('Start with the nearby tailoring job.'), findsOneWidget);
      expect(find.textContaining('You already sew blouses.'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('ai-item-GROUP-g-1')));
      await tester.pumpAndSettle();
      expect(find.text('route:/community/groups/g-1'), findsOneWidget);
    });

    testWidgets('a used-up quota says when it comes back (bn)', (tester) async {
      final api = FakeApi()
        ..on('GET /ai/status', FakeResponse.data(_status()))
        ..on(
          'POST /ai/opportunity-suggestions',
          _error(429, 'AI_QUOTA_EXCEEDED'),
        );
      await pumpRouted(
        tester,
        api: api,
        home: const AiSuggestionsScreen(),
        locale: const Locale('bn'),
      );
      await tester.tap(find.byKey(const ValueKey('ai-suggest')));
      await tester.pumpAndSettle();
      expect(find.textContaining('আজকের AI অনুরোধ শেষ।'), findsOneWidget);
      expect(find.textContaining('আবার পাবেন:'), findsOneWidget);
    });

    test('every suggestion type opens its own screen', () {
      expect(
        aiSuggestionRoute(
          const AiSuggestion(type: 'LEARNING', id: 'l1', title: 'x'),
        ),
        '/learn/opportunities/l1',
      );
      expect(
        aiSuggestionRoute(
          const AiSuggestion(type: 'MENTOR', id: 'u1', title: 'x'),
        ),
        '/workers/u1/profile',
      );
      expect(
        aiSuggestionRoute(
          const AiSuggestion(type: 'JOB', id: 'j1', title: 'x'),
        ),
        '/jobs/j1',
      );
    });
  });

  group('idea analysis', () {
    testWidgets('a non-subscriber is asked to subscribe', (tester) async {
      final api = FakeApi()
        ..on('GET /ai/status', FakeResponse.data(_status(subscribed: false)))
        ..on('GET /ideas/idea-1/ai-analysis', FakeResponse.data(_empty));
      await pumpRouted(
        tester,
        api: api,
        home: const IdeaAnalysisScreen(ideaId: 'idea-1'),
      );
      expect(find.text('No analysis yet'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('ai-analyse')));
      await tester.pumpAndSettle();
      expect(find.text('This is for subscribers'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('ai-subscribe')));
      await tester.pumpAndSettle();
      expect(find.text('route:/settings/subscription'), findsOneWidget);
      expect(api.called('POST /ideas/idea-1/ai-analysis'), isEmpty);
    });

    testWidgets('turns on AI for the idea, then shows the analysis', (
      tester,
    ) async {
      var calls = 0;
      final api = FakeApi();
      api
        ..on('GET /ai/status', FakeResponse.data(_status()))
        ..on('GET /ideas/idea-1/ai-analysis', FakeResponse.data(_empty))
        ..on('PATCH /ideas/idea-1', FakeResponse.data({'id': 'idea-1'}))
        ..onRequest('POST /ideas/idea-1/ai-analysis', (_) {
          calls++;
          if (calls == 1) return _error(409, 'AI_IDEA_CONSENT_REQUIRED');
          api.on('GET /ideas/idea-1/ai-analysis', FakeResponse.data(_analysis));
          return FakeResponse.data(_analysis);
        });
      await pumpRouted(
        tester,
        api: api,
        home: const IdeaAnalysisScreen(ideaId: 'idea-1'),
        size: const Size(400, 2400),
      );
      expect(find.text('AI requests left today: 3/3'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('ai-analyse')));
      // The button spins behind the dialog, so the tree never settles.
      for (var i = 0; i < 5; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      await tester.tap(find.byKey(const ValueKey('ai-allow-idea')));
      await tester.pumpAndSettle();
      expect(api.called('PATCH /ideas/idea-1').single.data, {
        'aiConsent': true,
      });
      expect(api.called('POST /ideas/idea-1/ai-analysis'), hasLength(2));
      expect(
        find.text('A small tailoring unit can work in Boalia.'),
        findsOneWidget,
      );
      expect(find.text('Two sewing machines'), findsOneWidget);
      expect(find.text('Late payments'), findsOneWidget);
      expect(find.text('Garment pricing'), findsOneWidget);
    });

    testWidgets('a declined analysis keeps the old one and explains (bn)', (
      tester,
    ) async {
      final api = FakeApi()
        ..on('GET /ai/status', FakeResponse.data(_status()))
        ..on('GET /ideas/idea-1/ai-analysis', FakeResponse.data(_analysis))
        ..on('POST /ideas/idea-1/ai-analysis', _error(422, 'AI_DECLINED'));
      await pumpRouted(
        tester,
        api: api,
        home: const IdeaAnalysisScreen(ideaId: 'idea-1'),
        locale: const Locale('bn'),
        size: const Size(400, 2400),
      );
      await tester.tap(find.byKey(const ValueKey('ai-analyse')));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('AI সহকারী এটি বিশ্লেষণ করতে পারেনি'),
        findsOneWidget,
      );
      expect(find.byKey(const ValueKey('ai-analysis')), findsOneWidget);
    });

    testWidgets('with AI off the stored analysis still shows', (tester) async {
      final api = FakeApi()
        ..on('GET /ai/status', FakeResponse.data(_status(enabled: false)))
        ..on('GET /ideas/idea-1/ai-analysis', FakeResponse.data(_analysis));
      await pumpRouted(
        tester,
        api: api,
        home: const IdeaAnalysisScreen(ideaId: 'idea-1'),
        size: const Size(400, 2400),
      );
      expect(find.byKey(const ValueKey('ai-analyse')), findsNothing);
      expect(find.byKey(const ValueKey('ai-off')), findsOneWidget);
      expect(find.byKey(const ValueKey('ai-analysis')), findsOneWidget);
    });
  });

  testWidgets('growth tips link to the next KAAJ step', (tester) async {
    final api = FakeApi()
      ..on('GET /ai/status', FakeResponse.data(_status()))
      ..on(
        'POST /businesses/b-1/ai-growth-tips',
        FakeResponse.data({
          'businessId': 'b-1',
          'source': 'FALLBACK',
          'summary': 'Grow with steady customers.',
          'tips': [
            {
              'title': 'Partner with a fabric seller',
              'detail': 'Share delivery costs.',
              'area': 'PARTNERSHIPS',
              'effort': 'LOW',
              'costBdt': {'min': 0, 'max': 500},
              'kaajAction': 'FIND_PARTNER',
            },
          ],
        }),
      );
    await pumpRouted(
      tester,
      api: api,
      home: const GrowthTipsScreen(businessId: 'b-1'),
      size: const Size(400, 1600),
    );
    await tester.tap(find.byKey(const ValueKey('ai-growth')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('ai-fallback')), findsOneWidget);
    expect(find.text('Partner with a fabric seller'), findsOneWidget);
    expect(find.textContaining('Effort: Low'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('tip-action-FIND_PARTNER')));
    await tester.pumpAndSettle();
    expect(find.text('route:/partners'), findsOneWidget);
  });

  testWidgets('AI unavailable is explained', (tester) async {
    final api = FakeApi()
      ..on('GET /ai/status', FakeResponse.data(_status()))
      ..on(
        'POST /businesses/b-1/ai-growth-tips',
        _error(503, 'AI_UNAVAILABLE'),
      );
    await pumpRouted(
      tester,
      api: api,
      home: const GrowthTipsScreen(businessId: 'b-1'),
    );
    await tester.tap(find.byKey(const ValueKey('ai-growth')));
    await tester.pumpAndSettle();
    expect(find.textContaining('The AI assistant is busy'), findsOneWidget);
  });
}
