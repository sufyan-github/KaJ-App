import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/permissions/permission_gateway.dart';
import 'package:kaaj/core/widgets/k_localized_text.dart';
import 'package:kaaj/features/settings/presentation/settings_screens.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';

class _Permissions extends PermissionGateway {
  @override
  Future<KPermissionStatus> status(KPermission permission) async =>
      KPermissionStatus.granted;
}

Map<String, dynamic> _privacy({
  String photo = 'EVERYONE',
  bool fullName = true,
  bool hideArea = false,
  String messages = 'ANYONE',
  bool discoverable = true,
}) => {
  'photoVisibility': photo,
  'showFullName': fullName,
  'hidePreciseArea': hideArea,
  'allowMessagesFrom': messages,
  'discoverable': discoverable,
};

void main() {
  Future<FakeApi> pumpPrivacy(
    WidgetTester tester, {
    Locale locale = const Locale('en'),
    FakeResponse? load,
  }) async {
    final api = FakeApi()
      ..on('GET /profiles/me/privacy', load ?? FakeResponse.data(_privacy()))
      ..onRequest('PUT /profiles/me/privacy', (request) {
        final changes = Map<String, dynamic>.from(request.data! as Map);
        return FakeResponse.data({..._privacy(), ...changes});
      });
    await pumpRouted(
      tester,
      api: api,
      home: PrivacySettingsScreen(permissionGateway: _Permissions()),
      locale: locale,
      size: const Size(400, 2400),
    );
    return api;
  }

  testWidgets('shows the stored choices', (tester) async {
    await pumpPrivacy(
      tester,
      load: FakeResponse.data(
        _privacy(photo: 'AFTER_HIRE', discoverable: false),
      ),
    );
    expect(find.text('Your privacy choices'), findsOneWidget);
    final photo = tester.widget<SegmentedButton<Object>>(
      find.byWidgetPredicate((w) => w is SegmentedButton),
    );
    expect(photo.selected.single.toString(), contains('afterHire'));
    final directory = tester.widget<SwitchListTile>(
      find.widgetWithText(SwitchListTile, 'Show me in the worker directory'),
    );
    expect(directory.value, isFalse);
  });

  testWidgets('each control saves only what changed', (tester) async {
    final api = await pumpPrivacy(tester);

    await tester.tap(find.text('Nobody'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Show my full name'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Hide my precise location'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Show me in the worker directory'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Only after a hire'));
    await tester.pumpAndSettle();

    final sent = api
        .called('PUT /profiles/me/privacy')
        .map((request) => request.data)
        .toList();
    expect(sent, [
      {'photoVisibility': 'NOBODY'},
      {'showFullName': false},
      {'hidePreciseArea': true},
      {'discoverable': false},
      {'allowMessagesFrom': 'ENGAGED_ONLY'},
    ]);
  });

  testWidgets('a failed save puts the switch back and says why', (
    tester,
  ) async {
    final api = await pumpPrivacy(tester, locale: const Locale('bn'));
    api.on(
      'PUT /profiles/me/privacy',
      FakeResponse.error(403, 'ACCOUNT_RESTRICTED'),
    );
    await tester.tap(find.text('কর্মী তালিকায় আমাকে দেখান'));
    await tester.pumpAndSettle();
    final directory = tester.widget<SwitchListTile>(
      find.widgetWithText(SwitchListTile, 'কর্মী তালিকায় আমাকে দেখান'),
    );
    expect(directory.value, isTrue);
    expect(
      find.textContaining('আপনার অ্যাকাউন্টে কাজের সুবিধা সাময়িকভাবে সীমিত'),
      findsOneWidget,
    );
  });

  testWidgets('an older server without privacy controls shows none', (
    tester,
  ) async {
    await pumpPrivacy(tester, load: FakeResponse.error(404, 'NOT_FOUND'));
    expect(find.text('Your privacy choices'), findsNothing);
    expect(find.byType(SwitchListTile), findsNothing);
    // The explanations and phone permissions are still there.
    expect(
      find.byWidgetPredicate(
        (widget) => widget is KLocalizedText && widget.data == 'ফোনের অনুমতি',
      ),
      findsOneWidget,
    );
  });
}
