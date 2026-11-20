import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/features/business/presentation/business_offerings_screen.dart';
import 'package:kaaj/features/onboarding/domain/onboarding_state.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';

Map<String, dynamic> _business(String? role) => {
  'id': 'b-1',
  'name': 'Rahim Agro',
  'stage': 'INFORMAL',
  'isPublic': true,
  'myRole': role,
  if (role != null) 'status': 'ACTIVE',
};

Map<String, dynamic> _offering(
  String id,
  String title, {
  String status = 'ACTIVE',
  String? hiddenReason,
}) => {
  'id': id,
  'businessId': 'b-1',
  'kind': 'PRODUCT',
  'titleEn': title,
  'titleBn': null,
  'description': null,
  'priceMinPoisha': '3000',
  'priceMaxPoisha': '4500',
  'priceUnit': 'per kg',
  'isActive': status != 'INACTIVE',
  'status': status,
  'hiddenReason': hiddenReason,
};

FakeApi _api(String? role) => FakeApi()
  ..on('GET /businesses/b-1', FakeResponse.data(_business(role)))
  ..on(
    'GET /businesses/b-1/offerings',
    FakeResponse.data({
      'items': [
        _offering('o-1', 'Potatoes'),
        if (role != null)
          _offering(
            'o-2',
            'Pesticide',
            status: 'HIDDEN',
            hiddenReason: 'Not allowed for sale',
          ),
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
  home: const BusinessOfferingsScreen(businessId: 'b-1'),
  locale: locale,
  size: const Size(400, 1400),
  overrides: [meAs(KaajRole.worker)],
);

void main() {
  testWidgets('a manager adds an offering with prices in poisha', (
    tester,
  ) async {
    final api = _api('MANAGER')
      ..on(
        'POST /businesses/b-1/offerings',
        FakeResponse.data(_offering('o-3', 'Onions'), status: 201),
      );
    await _open(tester, api);
    expect(find.textContaining('৳30'), findsWidgets);
    expect(find.text('Not allowed for sale'), findsOneWidget);
    expect(find.text('Hidden by KAAJ'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('offering-add')));
    await tester.pumpAndSettle();
    // A title is required in one language.
    await tester.tap(find.byKey(const ValueKey('offering-save')));
    await tester.pumpAndSettle();
    expect(
      find.text('Give at least one name, in Bangla or English'),
      findsOneWidget,
    );
    expect(api.called('POST /businesses/b-1/offerings'), isEmpty);

    await tester.enterText(
      find.byKey(const ValueKey('offering-title-en')),
      'Onions',
    );
    await tester.enterText(find.byKey(const ValueKey('offering-min')), '40');
    await tester.enterText(find.byKey(const ValueKey('offering-max')), '55.5');
    await tester.enterText(
      find.byKey(const ValueKey('offering-unit')),
      'per kg',
    );
    await tester.tap(find.byKey(const ValueKey('offering-save')));
    await tester.pumpAndSettle();
    expect(api.called('POST /businesses/b-1/offerings').single.data, {
      'kind': 'PRODUCT',
      'titleEn': 'Onions',
      'priceMinPoisha': '4000',
      'priceMaxPoisha': '5550',
      'priceUnit': 'per kg',
      'isActive': true,
    });
    expect(
      api.called('GET /businesses/b-1/offerings').length,
      greaterThanOrEqualTo(2),
    );
  });

  testWidgets('a refusal stays in the form', (tester) async {
    final api = _api('OWNER')
      ..on(
        'PATCH /businesses/b-1/offerings/o-1',
        FakeResponse.error(400, 'OFFERING_PRICE_INVALID'),
      );
    await _open(tester, api);
    await tester.tap(find.text('Potatoes'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const ValueKey('offering-unit')), '');
    await tester.tap(find.byKey(const ValueKey('offering-save')));
    await tester.pumpAndSettle();
    final body =
        api.called('PATCH /businesses/b-1/offerings/o-1').single.data! as Map;
    expect(body['priceUnit'], isNull);
    expect(body['priceMinPoisha'], '3000');
    expect(find.byKey(const ValueKey('offering-save')), findsOneWidget);
  });

  testWidgets('deleting asks first', (tester) async {
    final api = _api('OWNER')
      ..on(
        'DELETE /businesses/b-1/offerings/o-1',
        FakeResponse.data({'id': 'o-1', 'deleted': true}),
      );
    await _open(tester, api);
    await tester.tap(find.byKey(const ValueKey('offering-menu-o-1')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('confirm-action')));
    await tester.pumpAndSettle();
    expect(api.called('DELETE /businesses/b-1/offerings/o-1'), hasLength(1));
  });

  testWidgets('a visitor reports an offering (bn)', (tester) async {
    await _open(tester, _api(null), locale: const Locale('bn'));
    expect(find.byKey(const ValueKey('offering-add')), findsNothing);
    expect(find.text('পণ্য'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('offering-menu-o-1')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('রিপোর্ট করুন'));
    await tester.pumpAndSettle();
    expect(find.text('route:/report/BUSINESS_OFFERING/o-1'), findsOneWidget);
  });

  testWidgets('no offerings shows an empty state', (tester) async {
    final api = _api(null)
      ..on(
        'GET /businesses/b-1/offerings',
        FakeResponse.data({'items': <Object>[]}),
      );
    await _open(tester, api);
    expect(find.text('No products or services yet'), findsOneWidget);
  });
}
