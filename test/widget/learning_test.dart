import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/widgets/k_primary_button.dart';
import 'package:kaaj/core/widgets/k_text_field.dart';
import 'package:kaaj/features/catalog/domain/entities/catalog_category.dart';
import 'package:kaaj/features/catalog/domain/entities/catalog_skill.dart';
import 'package:kaaj/features/catalog/domain/entities/service_location.dart';
import 'package:kaaj/features/catalog/presentation/controllers/catalog_providers.dart';
import 'package:kaaj/features/learning/presentation/learn_explore.dart';
import 'package:kaaj/features/learning/presentation/learning_detail_screen.dart';
import 'package:kaaj/features/learning/presentation/publish_learning_screen.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';

Map<String, dynamic> _opportunity({
  String id = 'opp-1',
  String type = 'TRAINING',
  String terms = 'FREE',
  String? fee,
  String? stipend,
  String status = 'APPLICATIONS_OPEN',
  String title = 'House wiring basics',
  Map<String, dynamic>? viewerApplication,
  bool mine = false,
}) => {
  'id': id,
  'opportunityType': type,
  'title': title,
  'description': 'Learn safe house wiring over four Saturday sessions.',
  'status': status,
  'participantTerms': terms,
  'participantFeePoisha': fee,
  'stipendPoisha': stipend,
  'seats': 6,
  'seatsFilled': 2,
  'startsAt': '2026-11-21T04:00:00Z',
  'endsAt': '2026-12-12T08:00:00Z',
  'workArrangement': 'ON_SITE',
  'flexibleHours': false,
  'category': {'id': 'cat-1', 'name_en': 'Electrical', 'name_bn': 'বৈদ্যুতিক'},
  'location': {'id': 'area-1', 'name_en': 'Kazla', 'name_bn': 'কাজলা'},
  'skills': [
    {'id': 'skill-1', 'name_en': 'House wiring', 'name_bn': 'ঘরের ওয়্যারিং'},
  ],
  'mentor': {
    'id': 'mentor-1',
    'displayName': 'Rafiq H.',
    'trustLevel': 'IDENTITY',
    'yearsExperience': 12,
  },
  'viewerIsMentor': mine,
  'viewerApplication': ?viewerApplication,
};

void main() {
  group('Explore → Learn', () {
    testWidgets('shows terms on every card and filters by terms', (
      tester,
    ) async {
      final api = FakeApi()
        ..onRequest(
          'GET /learning-opportunities',
          (request) => request.query['participantTerms'] == 'STIPEND'
              ? FakeResponse.data({
                  'items': [
                    _opportunity(
                      id: 'opp-2',
                      type: 'APPRENTICESHIP',
                      terms: 'STIPEND',
                      stipend: '300000',
                      title: 'Tailoring apprentice',
                    ),
                  ],
                })
              : FakeResponse.data({
                  'items': [
                    _opportunity(),
                    _opportunity(
                      id: 'opp-3',
                      terms: 'PAID_BY_PARTICIPANT',
                      fee: '50000',
                      title: 'Mobile repair course',
                    ),
                  ],
                }),
        );
      await pumpRouted(
        tester,
        api: api,
        home: const Scaffold(body: LearnExploreBody()),
        size: const Size(400, 2000),
      );
      expect(find.text('House wiring basics'), findsOneWidget);
      expect(find.text('Free'), findsWidgets);
      expect(find.text('You pay a fee: ৳500'), findsOneWidget);
      expect(find.text('Training'), findsWidgets);
      expect(find.textContaining('Job'), findsNothing);

      await tester.ensureVisible(
        find.byKey(const ValueKey('learn-terms-STIPEND')),
      );
      await tester.tap(find.byKey(const ValueKey('learn-terms-STIPEND')));
      await tester.pumpAndSettle();
      expect(find.text('Tailoring apprentice'), findsOneWidget);
      expect(find.text('You receive an allowance: ৳3,000'), findsOneWidget);
      expect(find.text('Apprenticeship'), findsWidgets);
      expect(
        api
            .called('GET /learning-opportunities')
            .last
            .query['participantTerms'],
        'STIPEND',
      );
    });

    testWidgets('search matches skills and areas (bn)', (tester) async {
      final api = FakeApi()
        ..on(
          'GET /learning-opportunities',
          FakeResponse.data({
            'items': [
              _opportunity(),
              _opportunity(id: 'opp-9', title: 'Sewing circle'),
            ],
          }),
        );
      await pumpRouted(
        tester,
        api: api,
        home: const Scaffold(body: LearnExploreBody(searchQuery: 'Sewing')),
        locale: const Locale('bn'),
      );
      expect(find.text('Sewing circle'), findsOneWidget);
      expect(find.text('House wiring basics'), findsNothing);
    });

    testWidgets('empty and error states', (tester) async {
      final api = FakeApi()
        ..on('GET /learning-opportunities', FakeResponse.data({'items': []}));
      await pumpRouted(
        tester,
        api: api,
        home: const Scaffold(body: LearnExploreBody()),
      );
      expect(find.text('No ways to learn yet'), findsOneWidget);

      api.on(
        'GET /learning-opportunities',
        FakeResponse.error(503, 'SERVICE_UNAVAILABLE'),
      );
      await tester.tap(find.byKey(const ValueKey('learn-kind-TRAINING')));
      await tester.pumpAndSettle();
      expect(find.textContaining('KAAJ is busy'), findsOneWidget);
    });

    testWidgets('online courses sit next to learning with a mentor', (
      tester,
    ) async {
      final api = FakeApi()
        ..on('GET /learning-opportunities', FakeResponse.data({'items': []}))
        ..on('GET /training/courses', FakeResponse.data({'items': []}));
      await pumpRouted(
        tester,
        api: api,
        home: const Scaffold(body: LearnExploreBody()),
      );
      await tester.tap(find.text('Online courses'));
      await tester.pumpAndSettle();
      expect(api.called('GET /training/courses'), hasLength(1));
    });
  });

  group('learning detail', () {
    Future<FakeApi> openDetail(
      WidgetTester tester, {
      Map<String, dynamic>? data,
      Locale locale = const Locale('en'),
    }) async {
      final api = FakeApi()
        ..on(
          'GET /learning-opportunities/opp-1',
          FakeResponse.data(data ?? _opportunity()),
        )
        ..on(
          'POST /learning-opportunities/opp-1/applications',
          FakeResponse.data({'id': 'app-1', 'status': 'PENDING'}),
        );
      await pumpRouted(
        tester,
        api: api,
        home: const LearningDetailScreen(opportunityId: 'opp-1'),
        locale: locale,
        size: const Size(400, 2000),
      );
      return api;
    }

    testWidgets('terms come first and must be accepted to apply', (
      tester,
    ) async {
      final api = await openDetail(tester);
      expect(find.byKey(const ValueKey('learning-terms')), findsOneWidget);
      expect(
        find.text('You pay nothing for this, and you receive no allowance.'),
        findsOneWidget,
      );
      expect(find.text('Seats left: 4'), findsNothing);
      expect(find.textContaining('Seats left: 4'), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('learning-apply')));
      await tester.pumpAndSettle();
      final send = find.byKey(const ValueKey('learning-send'));
      expect(tester.widget<FilledButton>(send).onPressed, isNull);
      await tester.tap(find.byKey(const ValueKey('learning-understood')));
      await tester.pump();
      await tester.enterText(
        find.byType(TextField).last,
        'I am free on Saturdays.',
      );
      api.on(
        'GET /learning-opportunities/opp-1',
        FakeResponse.data(
          _opportunity(viewerApplication: {'id': 'app-1', 'status': 'PENDING'}),
        ),
      );
      await tester.tap(send);
      await tester.pumpAndSettle();

      expect(
        api
            .called('POST /learning-opportunities/opp-1/applications')
            .single
            .data,
        {'message': 'I am free on Saturdays.'},
      );
      expect(find.byKey(const ValueKey('learning-applied')), findsOneWidget);
    });

    testWidgets('a refusal stays in the dialog with the reason', (
      tester,
    ) async {
      final api = await openDetail(tester);
      api.on(
        'POST /learning-opportunities/opp-1/applications',
        FakeResponse.error(409, 'ALREADY_APPLIED'),
      );
      await tester.tap(find.byKey(const ValueKey('learning-apply')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('learning-understood')));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('learning-send')));
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsOneWidget);
      expect(
        find.text('You have already applied for this way to learn.'),
        findsOneWidget,
      );
      expect(find.textContaining('job'), findsNothing);
    });

    testWidgets('a stipend apprenticeship says it is not a job (bn)', (
      tester,
    ) async {
      await openDetail(
        tester,
        data: _opportunity(
          type: 'APPRENTICESHIP',
          terms: 'STIPEND',
          stipend: '300000',
        ),
        locale: const Locale('bn'),
      );
      expect(find.text('শিক্ষানবিশি'), findsOneWidget);
      expect(
        find.text(
          'শেখার সময় মেন্টর আপনাকে ভাতা দেবেন। এটি চাকরি বা বেতন নয়।',
        ),
        findsOneWidget,
      );
    });

    testWidgets('the mentor sees their own opportunity without Apply', (
      tester,
    ) async {
      await openDetail(tester, data: _opportunity(mine: true));
      expect(find.byKey(const ValueKey('learning-apply')), findsNothing);
      expect(find.text('You published this.'), findsOneWidget);
    });
  });

  group('publishing', () {
    testWidgets('a mentor publishes a paid training with clear terms', (
      tester,
    ) async {
      final api = FakeApi()
        ..on(
          'POST /learning-opportunities',
          FakeResponse.data(_opportunity(id: 'new-1', status: 'DRAFT')),
        )
        ..on(
          'POST /learning-opportunities/new-1/publish',
          FakeResponse.data(_opportunity(id: 'new-1')),
        );
      await pumpRouted(
        tester,
        api: api,
        home: const PublishLearningScreen(),
        size: const Size(400, 3200),
        overrides: [
          categoryTreeProvider.overrideWith(
            (ref) async => const [
              CatalogCategory(
                id: 'cat-1',
                slug: 'electrical',
                nameEn: 'Electrical',
                nameBn: 'বৈদ্যুতিক',
                sortOrder: 1,
              ),
            ],
          ),
          locationChildrenProvider.overrideWith(
            (ref, parentId) async => const [
              ServiceLocation(
                id: 'area-1',
                type: ServiceLocationType.area,
                nameEn: 'Kazla',
                nameBn: 'কাজলা',
              ),
            ],
          ),
          catalogSkillsProvider.overrideWith(
            (ref) async => const [
              CatalogSkill(
                id: 'skill-1',
                slug: 'wiring',
                nameEn: 'House wiring',
                nameBn: 'ঘরের ওয়্যারিং',
                categoryId: 'cat-1',
              ),
            ],
          ),
        ],
      );
      final fields = tester
          .widgetList<KTextField>(find.byType(KTextField))
          .toList();
      fields[0].controller!.text = 'House wiring basics';
      fields[1].controller!.text = 'Four Saturday sessions on safe wiring.';

      // Missing category first.
      await tester.ensureVisible(find.byType(KPrimaryButton));
      await tester.tap(find.byType(KPrimaryButton));
      await tester.pumpAndSettle();
      expect(
        find.text('Choose the type of work you will teach.'),
        findsOneWidget,
      );

      await tester.tap(find.byKey(const ValueKey('learning-category')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Electrical').last);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('learning-skill-skill-1')));
      await tester.tap(
        find.byKey(const ValueKey('learning-terms-PAID_BY_PARTICIPANT')),
      );
      await tester.pumpAndSettle();
      final amount = tester
          .widgetList<KTextField>(find.byType(KTextField))
          .firstWhere((field) => field.label.contains('ফি'));
      amount.controller!.text = '৫০০';
      expect(find.text('Choose the area where you will teach.'), findsNothing);
      await tester.ensureVisible(find.byType(KPrimaryButton));
      await tester.tap(find.byType(KPrimaryButton));
      await tester.pumpAndSettle();
      expect(
        find.text('Choose the area where you will teach.'),
        findsOneWidget,
      );
      expect(api.called('POST /learning-opportunities'), isEmpty);

      await tester.ensureVisible(find.byKey(const ValueKey('learning-area')));
      await tester.tap(find.byKey(const ValueKey('learning-area')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Kazla'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byType(KPrimaryButton));
      await tester.tap(find.byType(KPrimaryButton));
      await tester.pumpAndSettle();

      final body =
          api.called('POST /learning-opportunities').single.data! as Map;
      expect(body['opportunityType'], 'TRAINING');
      expect(body['participantTerms'], 'PAID_BY_PARTICIPANT');
      expect(body['participantFeePoisha'], '50000');
      expect(body.containsKey('stipendPoisha'), isFalse);
      expect(body['categoryId'], 'cat-1');
      expect(body['skillIds'], ['skill-1']);
      expect(body['locationId'], 'area-1');
      expect(body['seats'], 5);
      expect(body['workArrangement'], 'ON_SITE');
      expect(
        api.called('POST /learning-opportunities/new-1/publish'),
        hasLength(1),
      );
      expect(find.text('route:/learn/opportunities/new-1'), findsOneWidget);
    });
  });

  testWidgets('the mentor lists their own and publishes a draft', (
    tester,
  ) async {
    final api = FakeApi()
      ..on(
        'GET /learning-opportunities/mine',
        FakeResponse.data({
          'items': [
            {
              ..._opportunity(id: 'd1', status: 'DRAFT'),
              'applicationsCount': 0,
            },
            {
              ..._opportunity(id: 'o2', title: 'Second'),
              'applicationsCount': 3,
            },
          ],
        }),
      )
      ..on(
        'POST /learning-opportunities/d1/publish',
        FakeResponse.data(_opportunity(id: 'd1')),
      );
    await pumpRouted(
      tester,
      api: api,
      home: const Scaffold(
        body: SingleChildScrollView(child: MyLearningOpportunities()),
      ),
      size: const Size(400, 2000),
    );
    expect(find.text('Applications: 3'), findsOneWidget);
    await tester.tap(find.text('Publish'));
    await tester.pumpAndSettle();
    expect(api.called('POST /learning-opportunities/d1/publish'), hasLength(1));
    expect(api.called('GET /learning-opportunities/mine'), hasLength(2));
  });
}
