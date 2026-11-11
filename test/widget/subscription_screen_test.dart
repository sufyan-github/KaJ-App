import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/features/auth/presentation/controllers/auth_providers.dart';
import 'package:kaaj/features/billing/presentation/billing_providers.dart';
import 'package:kaaj/features/billing/presentation/billing_screens.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';

void main() {
  late FakeApi api;
  late List<Uri> launched;
  late bool launchResult;

  setUp(() {
    api = FakeApi()
      ..on('GET /subscriptions/me', FakeResponse.data(_overview()));
    launched = [];
    launchResult = true;
  });

  Future<void> pumpScreen(WidgetTester tester, {String locale = 'en'}) =>
      pumpRouted(
        tester,
        api: api,
        locale: Locale(locale),
        home: const SubscriptionScreen(),
        overrides: [
          authControllerProvider.overrideWith((ref) => signedInAuth()),
          externalUriLauncherProvider.overrideWithValue((uri) async {
            launched.add(uri);
            return launchResult;
          }),
        ],
      );

  Future<void> confirmCancel(WidgetTester tester) async {
    final cancel = find.text('Cancel subscription');
    await tester.scrollUntilVisible(cancel, 200);
    await tester.tap(cancel);
    await tester.pumpAndSettle();
    expect(find.text('Cancel your subscription?'), findsOneWidget);
    expect(
      find.text(
        'Cancelling stops the daily operator charge and your KAAJ subscription access ends now.',
      ),
      findsOneWidget,
    );
    await tester.tap(find.text('Yes, cancel'));
    await tester.pumpAndSettle();
  }

  testWidgets('shows carrier status and exact daily price wording', (
    tester,
  ) async {
    await pumpScreen(tester);

    expect(find.text('Subscribed with your operator'), findsOneWidget);
    expect(find.text('৳2.78/day + VAT, renews daily'), findsNWidgets(2));
    expect(find.textContaining('Expires:'), findsOneWidget);
    expect(
      find.text('The subscription plan is being set up. Contact support.'),
      findsNothing,
    );
  });

  testWidgets('shows the daily price wording in Bangla', (tester) async {
    await pumpScreen(tester, locale: 'bn');

    expect(find.text('৳২.৭৮/দিন + ভ্যাট, প্রতিদিন নবায়ন'), findsNWidgets(2));
    expect(find.text('অপারেটরে সাবস্ক্রিপশন চালু'), findsOneWidget);
  });

  testWidgets('declining the confirmation keeps the subscription', (
    tester,
  ) async {
    await pumpScreen(tester);
    final cancel = find.text('Cancel subscription');
    await tester.scrollUntilVisible(cancel, 200);
    await tester.tap(cancel);
    await tester.pumpAndSettle();
    await tester.tap(find.text('No, keep it'));
    await tester.pumpAndSettle();

    expect(api.called('POST /subscriptions/cancel'), isEmpty);
  });

  testWidgets('confirmed cancel calls the API and reports success', (
    tester,
  ) async {
    api.on(
      'POST /subscriptions/cancel',
      FakeResponse.data(
        _overview(status: 'CANCELLED', carrier: 'UNREGISTERED', access: false),
      ),
    );
    await pumpScreen(tester);
    final loadsBefore = api.called('GET /subscriptions/me').length;

    await confirmCancel(tester);

    expect(api.called('POST /subscriptions/cancel'), hasLength(1));
    expect(find.text('Subscription cancelled.'), findsOneWidget);
    expect(
      api.called('GET /subscriptions/me').length,
      greaterThan(loadsBefore),
    );
    expect(find.text('Cancel by SMS'), findsNothing);
  });

  testWidgets(
    'operator failure offers the SMS fallback with open and copy actions',
    (tester) async {
      final clipboard = <String>[];
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        (call) async {
          if (call.method == 'Clipboard.setData') {
            clipboard.add((call.arguments as Map)['text'] as String);
          }
          return null;
        },
      );
      addTearDown(
        () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
          SystemChannels.platform,
          null,
        ),
      );
      api.on(
        'POST /subscriptions/cancel',
        FakeResponse.error(
          503,
          'OPERATOR_UNSUBSCRIBE_FAILED',
          details: [
            {'smsKeyword': 'STOP kaaj', 'shortCode': '21213'},
          ],
        ),
      );
      await pumpScreen(tester);

      await confirmCancel(tester);

      expect(find.text('Cancel by SMS'), findsOneWidget);
      expect(find.text('STOP kaaj'), findsOneWidget);
      expect(find.text('21213'), findsOneWidget);
      expect(find.text('Subscription cancelled.'), findsNothing);

      await tester.tap(find.text('Open SMS app'));
      await tester.pumpAndSettle();
      expect(launched.single.toString(), 'sms:21213?body=STOP%20kaaj');

      await tester.tap(find.text('Copy message'));
      await tester.pumpAndSettle();
      expect(clipboard, ['STOP kaaj']);
      expect(find.text('Message copied.'), findsOneWidget);
    },
  );

  testWidgets(
    'fallback uses overview instructions and survives a failed launch',
    (tester) async {
      launchResult = false;
      api
        ..on(
          'GET /subscriptions/me',
          FakeResponse.data(
            _overview(
              instructions: {'smsKeyword': 'STOP kaaj', 'shortCode': '16000'},
            ),
          ),
        )
        ..on(
          'POST /subscriptions/cancel',
          FakeResponse.error(503, 'OPERATOR_UNSUBSCRIBE_FAILED'),
        );
      await pumpScreen(tester);

      await confirmCancel(tester);
      expect(find.text('16000'), findsOneWidget);
      await tester.tap(find.text('Open SMS app'));
      await tester.pumpAndSettle();

      expect(launched.single.toString(), 'sms:16000?body=STOP%20kaaj');
      expect(
        find.text(
          'The SMS app could not be opened. Copy the message and send it yourself.',
        ),
        findsOneWidget,
      );
    },
  );

  testWidgets('other cancel failures show localized copy, not the sheet', (
    tester,
  ) async {
    api.on(
      'POST /subscriptions/cancel',
      FakeResponse.error(409, 'SUBSCRIPTION_NOT_ACTIVE'),
    );
    await pumpScreen(tester, locale: 'bn');
    final cancel = find.text('সাবস্ক্রিপশন বাতিল করুন');
    await tester.scrollUntilVisible(cancel, 200);
    await tester.tap(cancel);
    await tester.pumpAndSettle();
    await tester.tap(find.text('হ্যাঁ, বাতিল করুন'));
    await tester.pumpAndSettle();

    expect(find.text('SMS দিয়ে বাতিল করুন'), findsNothing);
    expect(find.text('Request refused'), findsNothing);
    expect(find.byType(SnackBar), findsOneWidget);
  });

  testWidgets('returning to the app reloads the subscription status', (
    tester,
  ) async {
    await pumpScreen(tester);
    final loadsBefore = api.called('GET /subscriptions/me').length;
    api.on(
      'GET /subscriptions/me',
      FakeResponse.data(_overview(carrier: 'CHARGE_PENDING')),
    );

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await _settleReload(tester);

    expect(api.called('GET /subscriptions/me').length, loadsBefore + 1);
    expect(
      find.text(
        'Operator charge pending; access continues until the current period ends',
      ),
      findsOneWidget,
    );
  });

  testWidgets('opening the screen again reloads a cached status', (
    tester,
  ) async {
    await pumpRouted(
      tester,
      api: api,
      home: Consumer(
        builder: (context, ref, _) {
          ref.watch(subscriptionOverviewProvider);
          return Scaffold(
            body: TextButton(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => const SubscriptionScreen(),
                ),
              ),
              child: const Text('open'),
            ),
          );
        },
      ),
      overrides: [authControllerProvider.overrideWith((ref) => signedInAuth())],
    );
    expect(api.called('GET /subscriptions/me'), hasLength(1));

    await tester.tap(find.text('open'));
    await _settleReload(tester);

    expect(api.called('GET /subscriptions/me'), hasLength(2));
    expect(find.text('Subscribed with your operator'), findsOneWidget);
  });

  for (final (locale, message) in [
    ('en', 'The subscription plan is being set up. Contact support.'),
    (
      'bn',
      'সাবস্ক্রিপশন প্ল্যান প্রস্তুত করা হচ্ছে। সহায়তার সঙ্গে যোগাযোগ করুন।',
    ),
  ]) {
    testWidgets('explains a missing carrier plan in $locale', (tester) async {
      api.on(
        'GET /subscriptions/me',
        FakeResponse.data(_overview(planMissing: true)),
      );
      await pumpScreen(tester, locale: locale);

      expect(find.text(message), findsOneWidget);
    });
  }
}

/// A background reload keeps the old data on screen, so no spinner frames
/// keep pumpAndSettle busy while the fake request completes.
Future<void> _settleReload(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 100));
  await tester.pumpAndSettle();
}

Map<String, dynamic> _plan() => {
  'id': 'plan-daily',
  'code': 'bdapps-daily',
  'nameEn': 'Daily subscription',
  'nameBn': 'দৈনিক সাবস্ক্রিপশন',
  'pricePoisha': '278',
  'currency': 'BDT',
  'durationDays': 1,
  'featureKeys': <String>[],
};

Map<String, dynamic> _overview({
  String status = 'ACTIVE',
  String? carrier = 'REGISTERED',
  bool access = true,
  bool planMissing = false,
  Map<String, dynamic>? instructions,
}) => {
  'accessActive': access,
  'gateEnabled': true,
  'onlinePaymentsEnabled': false,
  'workerWithdrawalsEnabled': false,
  'operatorStatusRefreshFailed': false,
  'operatorPlanMissing': planMissing,
  'carrierStatus': carrier,
  'cancelInstructions':
      instructions ??
      {'smsKeyword': 'STOP kaaj', 'shortCode': '21213', 'inApp': true},
  'operator': {
    'status': 'VERIFIED',
    'operator': {'code': 'ROBI', 'nameEn': 'Robi', 'nameBn': 'রবি'},
  },
  'current': {
    'id': 'subscription-id',
    'status': status,
    'plan': _plan(),
    'startsAt': '2026-11-10T09:00:00.000Z',
    'expiresAt': '2026-11-12T09:00:00.000Z',
    'payment': {'status': 'PAID', 'method': 'OPERATOR_BILLING'},
  },
  'plans': [_plan()],
  'operators': [
    {'code': 'ROBI', 'nameEn': 'Robi', 'nameBn': 'রবি'},
  ],
};
