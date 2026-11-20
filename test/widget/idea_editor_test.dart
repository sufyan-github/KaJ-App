import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/features/ideas/presentation/idea_editor_screen.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';

const _sectors = {
  'items': [
    {'id': 'sec-1', 'slug': 'agriculture', 'nameEn': 'Agriculture'},
    {'id': 'sec-2', 'slug': 'technology', 'nameEn': 'Technology'},
  ],
};

Map<String, dynamic> _owned({String visibility = 'PRIVATE'}) => {
  'id': 'idea-1',
  'title': 'Solar dryer for mangoes',
  'summary': 'Dry mangoes with the sun to sell all year.',
  'category': {'id': 'sec-1', 'nameEn': 'Agriculture', 'nameBn': 'কৃষি'},
  'area': null,
  'stage': 'CONCEPT',
  'stageLabel': {'en': 'Concept', 'bn': 'ধারণা'},
  'owner': {
    'userId': 'user-1',
    'displayName': 'Rahim',
    'identityVerified': false,
  },
  'roles': [],
  'teamSize': 1,
  'myRelation': 'OWNER',
  'canViewDetails': true,
  'details': {
    'problem': 'Mangoes rot in the season.',
    'solution': 'A cheap solar dryer in each village.',
    'details': null,
  },
  'visibility': visibility,
  'aiConsent': false,
  'convertedBusinessId': null,
  'status': 'ACTIVE',
};

Future<void> _type(WidgetTester tester, String key, String text) async {
  final field = find.descendant(
    of: find.byKey(ValueKey(key)),
    matching: find.byType(EditableText),
  );
  await tester.ensureVisible(field);
  await tester.enterText(field, text);
}

Future<void> _tapKey(WidgetTester tester, String key) async {
  await tester.ensureVisible(find.byKey(ValueKey(key)));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(ValueKey(key)));
  await tester.pumpAndSettle();
}

Future<void> _fill(WidgetTester tester) async {
  await _type(tester, 'idea-title', 'Solar dryer for mangoes');
  await _type(tester, 'idea-summary', 'Dry mangoes with the sun all year.');
  await _type(tester, 'idea-problem', 'Mangoes rot in the season.');
  await _type(tester, 'idea-solution', 'A cheap solar dryer per village.');
  await _tapKey(tester, 'idea-sector');
  await tester.tap(find.text('Agriculture').last);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('creates an idea and opens it', (tester) async {
    final api = FakeApi()
      ..on('GET /business-categories', FakeResponse.data(_sectors))
      ..on('POST /ideas', FakeResponse.data(_owned(), status: 201));
    await pumpRouted(
      tester,
      api: api,
      home: const IdeaEditorScreen(),
      size: const Size(400, 3000),
    );

    // Nothing is sent while required parts are missing.
    await _tapKey(tester, 'idea-save');
    expect(api.called('POST /ideas'), isEmpty);
    expect(find.text('Choose a sector.'), findsOneWidget);
    expect(find.text('The title must be 3 to 120 characters.'), findsOneWidget);

    await _fill(tester);
    await _tapKey(tester, 'idea-stage-PILOT');
    await _tapKey(tester, 'idea-save');

    final body = api.called('POST /ideas').single.data as Map;
    expect(body, {
      'title': 'Solar dryer for mangoes',
      'summary': 'Dry mangoes with the sun all year.',
      'problem': 'Mangoes rot in the season.',
      'solution': 'A cheap solar dryer per village.',
      'categoryId': 'sec-1',
      'stage': 'PILOT',
      'visibility': 'PRIVATE',
    });
    expect(body.containsKey('aiConsent'), isFalse);
    expect(find.text('route:/ideas/idea-1'), findsOneWidget);
  });

  testWidgets('explains that a public summary needs identity', (tester) async {
    final api = FakeApi()
      ..on('GET /business-categories', FakeResponse.data(_sectors))
      ..on('POST /ideas', FakeResponse.error(409, 'IDENTITY_REQUIRED'));
    await pumpRouted(
      tester,
      api: api,
      home: const IdeaEditorScreen(),
      size: const Size(400, 3000),
    );
    await _fill(tester);
    expect(
      find.textContaining('This needs your identity verification'),
      findsOneWidget,
    );
    await _tapKey(tester, 'idea-visibility-SUMMARY_PUBLIC');
    await _tapKey(tester, 'idea-save');
    expect(
      (api.called('POST /ideas').single.data as Map)['visibility'],
      'SUMMARY_PUBLIC',
    );
    expect(
      find.textContaining('To open the summary to everyone, verify'),
      findsOneWidget,
    );
  });

  testWidgets('edits only what changed and deletes after confirming', (
    tester,
  ) async {
    final api = FakeApi()
      ..on('GET /business-categories', FakeResponse.data(_sectors))
      ..on('GET /ideas/idea-1', FakeResponse.data(_owned()))
      ..on('PATCH /ideas/idea-1', FakeResponse.data(_owned()))
      ..on('DELETE /ideas/idea-1', FakeResponse.data({'deleted': true}));
    await pumpRouted(
      tester,
      api: api,
      home: const IdeaEditorScreen(ideaId: 'idea-1'),
      size: const Size(400, 3000),
    );
    expect(find.text('Edit idea'), findsOneWidget);
    await _type(tester, 'idea-summary', 'Sun-dried mangoes all year round.');
    await _tapKey(tester, 'idea-save');
    expect(api.called('PATCH /ideas/idea-1').single.data, {
      'summary': 'Sun-dried mangoes all year round.',
    });

    await _tapKey(tester, 'idea-delete');
    expect(find.text('Delete this idea?'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('idea-confirm')));
    await tester.pumpAndSettle();
    expect(api.called('DELETE /ideas/idea-1'), hasLength(1));
  });

  testWidgets('someone else cannot edit (404 not available)', (tester) async {
    final api = FakeApi()
      ..on('GET /business-categories', FakeResponse.data(_sectors));
    await pumpRouted(
      tester,
      api: api,
      locale: const Locale('bn'),
      home: const IdeaEditorScreen(ideaId: 'idea-x'),
    );
    expect(find.text('আইডিয়াটি পাওয়া যাচ্ছে না'), findsOneWidget);
  });
}
