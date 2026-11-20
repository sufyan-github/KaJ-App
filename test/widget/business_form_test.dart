import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/features/business/presentation/business_form_screen.dart';
import 'package:kaaj/features/onboarding/domain/onboarding_state.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';

Map<String, dynamic> _business({
  String myRole = 'OWNER',
  String stage = 'INFORMAL',
  String? licence,
}) => {
  'id': 'b-1',
  'name': 'Rahim Agro',
  'stage': stage,
  'description': 'Fresh vegetables',
  'category': {
    'id': 'cat-1',
    'slug': 'agriculture',
    'nameEn': 'Agriculture',
    'nameBn': 'কৃষি',
  },
  'area': {'id': 'area-1', 'nameEn': 'Boalia', 'nameBn': 'বোয়ালিয়া'},
  'employeesCount': 3,
  'isPublic': false,
  'seekingPartners': false,
  'verified': false,
  'status': 'ACTIVE',
  'tradeLicenceNo': licence,
  'verificationStatus': 'NOT_SUBMITTED',
  'myRole': myRole,
};

FakeApi _api() => FakeApi()
  ..on(
    'GET /business-categories',
    FakeResponse.data({
      'items': [
        {
          'id': 'cat-1',
          'parentId': null,
          'slug': 'agriculture',
          'nameEn': 'Agriculture',
          'nameBn': 'কৃষি',
        },
        {
          'id': 'cat-2',
          'parentId': null,
          'slug': 'food',
          'nameEn': 'Food',
          'nameBn': 'খাদ্য',
        },
      ],
    }),
  )
  ..on('GET /me/businesses', FakeResponse.data({'items': <Object>[]}));

Future<void> _open(
  WidgetTester tester,
  FakeApi api, {
  String? businessId,
  Locale locale = const Locale('en'),
}) => pumpRouted(
  tester,
  api: api,
  home: BusinessFormScreen(businessId: businessId),
  locale: locale,
  size: const Size(400, 2200),
  overrides: [meAs(KaajRole.worker)],
);

Map<String, dynamic> _body(FakeApi api, String route) =>
    Map<String, dynamic>.from(api.called(route).single.data! as Map);

void main() {
  testWidgets('creates a registered business with only the filled fields', (
    tester,
  ) async {
    final api = _api()
      ..on(
        'POST /businesses',
        FakeResponse.data({..._business(), 'id': 'b-new'}, status: 201),
      );
    await _open(tester, api);
    expect(find.text('Boalia'), findsOneWidget);
    expect(find.byKey(const ValueKey('business-licence')), findsNothing);

    await tester.enterText(
      find.byKey(const ValueKey('business-name')),
      'Rahim Agro',
    );
    await tester.tap(find.byKey(const ValueKey('business-stage-REGISTERED')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('business-licence')),
      'TL-123',
    );
    await tester.tap(find.byKey(const ValueKey('business-sector')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Food').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('business-save')));
    await tester.pumpAndSettle();

    expect(_body(api, 'POST /businesses'), {
      'name': 'Rahim Agro',
      'stage': 'REGISTERED',
      'categoryId': 'cat-2',
      'locationId': 'area-1',
      'tradeLicenceNo': 'TL-123',
      'isPublic': false,
      'seekingPartners': false,
    });
    expect(find.text('route:/businesses/b-new'), findsOneWidget);
  });

  testWidgets('a short name is refused before sending', (tester) async {
    final api = _api();
    await _open(tester, api);
    await tester.enterText(find.byKey(const ValueKey('business-name')), 'R');
    await tester.tap(find.byKey(const ValueKey('business-save')));
    await tester.pumpAndSettle();
    expect(api.called('POST /businesses'), isEmpty);
    expect(find.text('Enter a name of at least 2 characters'), findsOneWidget);
  });

  testWidgets('publishing without a sector shows the server reason', (
    tester,
  ) async {
    final api = _api()
      ..on(
        'POST /businesses',
        FakeResponse.error(
          409,
          'BUSINESS_PROFILE_INCOMPLETE',
          details: [
            {'field': 'categoryId'},
          ],
        ),
      );
    await _open(tester, api);
    await tester.enterText(
      find.byKey(const ValueKey('business-name')),
      'Rahim Agro',
    );
    await tester.tap(find.byKey(const ValueKey('business-public')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('business-save')));
    await tester.pumpAndSettle();
    expect(_body(api, 'POST /businesses')['isPublic'], isTrue);
    expect(
      find.text('Add a sector and an area before making the business public.'),
      findsOneWidget,
    );
  });

  testWidgets('edit sends only the changed fields', (tester) async {
    final api = _api()
      ..on('GET /businesses/b-1', FakeResponse.data(_business()))
      ..on('PATCH /businesses/b-1', FakeResponse.data(_business()));
    await _open(tester, api, businessId: 'b-1');
    expect(find.text('Rahim Agro'), findsOneWidget);
    await tester.enterText(
      find.byKey(const ValueKey('business-employees')),
      '7',
    );
    await tester.enterText(
      find.byKey(const ValueKey('business-description')),
      '',
    );
    await tester.tap(find.byKey(const ValueKey('business-seeking')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('business-save')));
    await tester.pumpAndSettle();
    expect(_body(api, 'PATCH /businesses/b-1'), {
      'description': null,
      'employeesCount': 7,
      'seekingPartners': true,
    });
  });

  testWidgets('the owner deletes after confirming (bn)', (tester) async {
    final api = _api()
      ..on('GET /businesses/b-1', FakeResponse.data(_business()))
      ..on(
        'DELETE /businesses/b-1',
        FakeResponse.data({'id': 'b-1', 'deleted': true}),
      );
    await _open(tester, api, businessId: 'b-1', locale: const Locale('bn'));
    expect(find.text('ব্যবসার তথ্য বদলান'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('business-delete')));
    await tester.pumpAndSettle();
    expect(find.text('ব্যবসাটি মুছে ফেলবেন?'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('confirm-action')));
    await tester.pumpAndSettle();
    expect(api.called('DELETE /businesses/b-1'), hasLength(1));
  });

  testWidgets('staff cannot edit: not available', (tester) async {
    final api = _api()
      ..on(
        'GET /businesses/b-1',
        FakeResponse.data(_business(myRole: 'STAFF')),
      );
    await _open(tester, api, businessId: 'b-1');
    expect(find.text('Not available'), findsOneWidget);
    expect(find.byKey(const ValueKey('business-save')), findsNothing);
  });
}
