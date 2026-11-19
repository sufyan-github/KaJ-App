import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/features/business/presentation/business_detail_screen.dart';
import 'package:kaaj/features/onboarding/domain/onboarding_state.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';

Map<String, dynamic> _public() => {
  'id': 'b-1',
  'name': 'Rahim Agro',
  'stage': 'REGISTERED',
  'stageLabel': {'en': 'Registered', 'bn': 'নিবন্ধিত'},
  'description': 'Fresh vegetables from Rajshahi',
  'category': {
    'id': 'cat-1',
    'slug': 'agriculture',
    'nameEn': 'Agriculture',
    'nameBn': 'কৃষি',
  },
  'area': {'id': 'area-1', 'nameEn': 'Boalia', 'nameBn': 'বোয়ালিয়া'},
  'employeesCount': 4,
  'isPublic': true,
  'seekingPartners': true,
  'verified': true,
  'owner': {'userId': 'u-9', 'displayName': 'R***', 'trustLevel': 'IDENTITY'},
  'createdAt': '2026-11-01T10:00:00Z',
  'myRole': null,
};

Map<String, dynamic> _member({String role = 'OWNER', bool suspended = false}) =>
    {
      ..._public(),
      'myRole': role,
      'status': suspended ? 'SUSPENDED' : 'ACTIVE',
      'address': 'Shaheb Bazar',
      'contactPerson': 'Rahim 01812345678',
      'tradeLicenceNo': 'TL-77',
      'verificationStatus': 'APPROVED',
    };

FakeApi _api(Map<String, dynamic> business) => FakeApi()
  ..on('GET /businesses/b-1', FakeResponse.data(business))
  ..on(
    'GET /businesses/b-1/offerings',
    FakeResponse.data({
      'items': [
        {
          'id': 'o-1',
          'businessId': 'b-1',
          'kind': 'PRODUCT',
          'titleEn': 'Potatoes',
          'titleBn': 'আলু',
          'priceMinPoisha': '3000',
          'priceMaxPoisha': '4000',
          'priceUnit': 'per kg',
          'isActive': true,
        },
      ],
    }),
  )
  ..on(
    'GET /businesses/b-1/jobs',
    FakeResponse.data({
      'items': [
        {
          'id': 'j-1',
          'title': 'Packing helper',
          'status': 'OPEN',
          'category': {'id': 'c', 'name_en': 'Farm', 'name_bn': 'খামার'},
          'location': {'id': 'l', 'name_en': 'Boalia', 'name_bn': 'বোয়ালিয়া'},
          'budgetMinPoisha': '50000',
          'budgetMaxPoisha': '50000',
        },
      ],
    }),
  )
  ..on(
    'GET /me/businesses',
    FakeResponse.data({'items': <Object>[], 'invitations': <Object>[]}),
  );

Future<void> _open(
  WidgetTester tester,
  FakeApi api, {
  Locale locale = const Locale('en'),
}) => pumpRouted(
  tester,
  api: api,
  home: const BusinessDetailScreen(businessId: 'b-1'),
  locale: locale,
  size: const Size(400, 2400),
  overrides: [meAs(KaajRole.worker)],
);

void main() {
  testWidgets('a visitor sees the public view and can request and report', (
    tester,
  ) async {
    final api = _api(_public());
    await _open(tester, api);
    expect(find.text('Rahim Agro'), findsWidgets);
    expect(find.text('Registered'), findsOneWidget);
    expect(find.text('Verified business'), findsOneWidget);
    expect(find.text('R***'), findsOneWidget);
    expect(find.text('Agriculture'), findsOneWidget);
    expect(find.text('Potatoes'), findsOneWidget);
    expect(find.text('Packing helper'), findsOneWidget);
    expect(find.text('Open jobs'), findsOneWidget);
    // Member parts stay hidden.
    expect(find.byKey(const ValueKey('business-member-info')), findsNothing);
    expect(find.byKey(const ValueKey('business-members')), findsNothing);
    expect(find.byKey(const ValueKey('business-edit')), findsNothing);

    await tester.tap(find.byKey(const ValueKey('business-collaborate')));
    await tester.pumpAndSettle();
    expect(find.text('route:/businesses/b-1/collaborate'), findsOneWidget);
  });

  testWidgets('a visitor reports the business', (tester) async {
    await _open(tester, _api(_public()));
    await tester.tap(find.byKey(const ValueKey('business-report')));
    await tester.pumpAndSettle();
    expect(find.text('route:/report/BUSINESS/b-1'), findsOneWidget);
  });

  testWidgets('an owner sees contact, management and a staff job button', (
    tester,
  ) async {
    await _open(tester, _api(_member()));
    expect(find.text('Shaheb Bazar'), findsOneWidget);
    expect(find.text('TL-77'), findsOneWidget);
    expect(find.byKey(const ValueKey('business-members')), findsOneWidget);
    expect(find.byKey(const ValueKey('business-verification')), findsOneWidget);
    expect(find.byKey(const ValueKey('business-report')), findsNothing);
    expect(find.byKey(const ValueKey('business-collaborate')), findsNothing);
    await tester.tap(find.byKey(const ValueKey('business-post-job')));
    await tester.pumpAndSettle();
    expect(find.text('route:/businesses/b-1/jobs/new'), findsOneWidget);
  });

  testWidgets('staff see no edit or verification; suspended shows a banner', (
    tester,
  ) async {
    await _open(tester, _api(_member(role: 'STAFF', suspended: true)));
    expect(find.byKey(const ValueKey('business-suspended')), findsOneWidget);
    expect(find.byKey(const ValueKey('business-edit')), findsNothing);
    expect(find.byKey(const ValueKey('business-verification')), findsNothing);
    expect(find.byKey(const ValueKey('business-post-job')), findsNothing);
  });

  testWidgets('leaving as the last owner is refused with the reason', (
    tester,
  ) async {
    final api = _api(_member())
      ..on(
        'DELETE /businesses/b-1/membership',
        FakeResponse.error(409, 'LAST_OWNER'),
      );
    await _open(tester, api);
    await tester.tap(find.byKey(const ValueKey('business-leave')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('confirm-action')));
    await tester.pumpAndSettle();
    expect(api.called('DELETE /businesses/b-1/membership'), hasLength(1));
    expect(
      find.text(
        'A business needs at least one owner. Add another owner first.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('a hidden business shows not available', (tester) async {
    final api = FakeApi()
      ..on('GET /businesses/b-1', FakeResponse.error(404, 'NOT_FOUND'));
    await _open(tester, api);
    expect(find.text('Not available'), findsOneWidget);
  });

  testWidgets('an invited member can accept from the detail (bn)', (
    tester,
  ) async {
    final api = _api(_member(role: 'STAFF'))
      ..on(
        'GET /me/businesses',
        FakeResponse.data({
          'items': <Object>[],
          'invitations': [
            {'business': _public(), 'role': 'STAFF'},
          ],
        }),
      )
      ..on('POST /businesses/b-1/membership/accept', FakeResponse.data({}));
    await _open(tester, api, locale: const Locale('bn'));
    expect(find.byKey(const ValueKey('business-invited')), findsOneWidget);
    expect(find.text('স্টাফ'), findsOneWidget);
    await tester.tap(find.text('গ্রহণ করুন'));
    await tester.pumpAndSettle();
    expect(api.called('POST /businesses/b-1/membership/accept'), hasLength(1));
  });
}
