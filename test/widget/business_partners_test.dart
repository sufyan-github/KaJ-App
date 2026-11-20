import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/features/business/presentation/business_explore.dart';
import 'package:kaaj/features/onboarding/domain/onboarding_state.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';

Map<String, dynamic> _business(String id, String name) => {
  'id': id,
  'name': name,
  'stage': 'INFORMAL',
  'stageLabel': {'en': 'Informal', 'bn': 'অনানুষ্ঠানিক'},
  'category': {
    'id': 'cat-1',
    'slug': 'food',
    'nameEn': 'Food',
    'nameBn': 'খাদ্য',
  },
  'area': {'id': 'area-1', 'nameEn': 'Boalia', 'nameBn': 'বোয়ালিয়া'},
  'isPublic': true,
  'seekingPartners': true,
  'verified': false,
  'owner': {'userId': 'u-$id', 'displayName': 'K***'},
};

FakeApi _api() => FakeApi()
  ..onRequest('GET /partners', (request) {
    if (request.query['cursor'] == 'page-2') {
      return FakeResponse.data({
        'items': [_business('b-3', 'Third Mart')],
        'nextCursor': null,
      });
    }
    return FakeResponse.data({
      'items': [
        _business('b-1', 'Rahim Agro'),
        _business('b-2', 'Karim Foods'),
      ],
      'nextCursor': 'page-2',
    });
  })
  ..on(
    'GET /business-categories',
    FakeResponse.data({
      'items': [
        {'id': 'cat-1', 'slug': 'food', 'nameEn': 'Food', 'nameBn': 'খাদ্য'},
        {
          'id': 'cat-2',
          'slug': 'retail',
          'nameEn': 'Retail',
          'nameBn': 'খুচরা',
        },
      ],
    }),
  );

Future<void> _open(
  WidgetTester tester,
  FakeApi api, {
  Widget home = const Scaffold(body: BusinessExploreBody()),
  Locale locale = const Locale('en'),
}) => pumpRouted(
  tester,
  api: api,
  home: home,
  locale: locale,
  size: const Size(400, 1200),
  overrides: [meAs(KaajRole.worker)],
);

Map<String, dynamic> _lastQuery(FakeApi api) =>
    api.called('GET /partners').last.query;

void main() {
  testWidgets('pages through partners and opens one', (tester) async {
    final api = _api();
    await _open(tester, api);
    expect(find.text('Rahim Agro'), findsOneWidget);
    expect(find.text('Seeking partners'), findsNWidgets(2));
    expect(_lastQuery(api), isEmpty);

    await tester.tap(find.byKey(const ValueKey('partners-load-more')));
    await tester.pumpAndSettle();
    expect(_lastQuery(api), {'cursor': 'page-2'});
    expect(find.text('Third Mart'), findsOneWidget);
    expect(find.byKey(const ValueKey('partners-load-more')), findsNothing);

    await tester.tap(find.text('Karim Foods'));
    await tester.pumpAndSettle();
    expect(find.text('route:/businesses/b-2'), findsOneWidget);
  });

  testWidgets('filters by area, stage and sector', (tester) async {
    final api = _api();
    await _open(tester, api);
    await tester.tap(find.byKey(const ValueKey('partners-near-me')));
    await tester.pumpAndSettle();
    expect(_lastQuery(api), {'locationId': 'area-1'});

    await tester.ensureVisible(
      find.byKey(const ValueKey('partners-stage-REGISTERED')),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('partners-stage-REGISTERED')));
    await tester.pumpAndSettle();
    expect(_lastQuery(api), {'locationId': 'area-1', 'stage': 'REGISTERED'});

    await tester.ensureVisible(find.byKey(const ValueKey('partners-sector')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('partners-sector')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('sector-cat-2')));
    await tester.pumpAndSettle();
    expect(_lastQuery(api), {
      'categoryId': 'cat-2',
      'stage': 'REGISTERED',
      'locationId': 'area-1',
    });
    expect(find.text('Retail'), findsOneWidget);
  });

  testWidgets('searches on the server from two letters', (tester) async {
    final api = _api();
    await _open(tester, api, home: const PartnersScreen());
    await tester.enterText(find.byKey(const ValueKey('partners-search')), 'a');
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pumpAndSettle();
    expect(_lastQuery(api).containsKey('q'), isFalse);

    await tester.enterText(
      find.byKey(const ValueKey('partners-search')),
      ' agro ',
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pumpAndSettle();
    expect(_lastQuery(api), {'q': 'agro'});
  });

  testWidgets('nothing found shows an empty state', (tester) async {
    final api = FakeApi()
      ..on('GET /partners', FakeResponse.data({'items': <Object>[]}));
    await _open(tester, api);
    expect(find.text('No businesses found'), findsOneWidget);
  });

  testWidgets('a load error retries (bn)', (tester) async {
    final api = FakeApi()
      ..on('GET /partners', FakeResponse.error(500, 'INTERNAL'));
    await _open(tester, api, locale: const Locale('bn'));
    expect(find.text('অংশীদারদের তালিকা লোড করা যায়নি।'), findsOneWidget);
    api.on(
      'GET /partners',
      FakeResponse.data({
        'items': [_business('b-1', 'Rahim Agro')],
      }),
    );
    await tester.tap(find.text('আবার চেষ্টা করুন'));
    await tester.pumpAndSettle();
    expect(find.text('Rahim Agro'), findsOneWidget);
    expect(find.text('অংশীদার খুঁজছে'), findsOneWidget);
  });
}
