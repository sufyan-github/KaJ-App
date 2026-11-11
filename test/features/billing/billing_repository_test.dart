import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/errors/failure.dart';
import 'package:kaaj/features/billing/data/billing_repository.dart';
import 'package:kaaj/features/billing/domain/billing_models.dart';

import '../../support/fake_api.dart';

void main() {
  test('parses safe operator hints without claiming verification', () async {
    final adapter = _BillingAdapter();
    final repository = BillingRepository(Dio()..httpClientAdapter = adapter);

    final overview = await repository.getSubscription();

    expect(overview.accessActive, isTrue);
    expect(overview.gateEnabled, isFalse);
    expect(overview.operatorIdentity?.status, 'PENDING');
    expect(overview.operatorIdentity?.operator?.code, 'ROBI');
    expect(overview.plans, isEmpty);
  });

  test('sends explicit plan and operator choices for a request', () async {
    final adapter = _BillingAdapter();
    final repository = BillingRepository(Dio()..httpClientAdapter = adapter);

    await repository.requestSubscription(
      planId: 'plan-id',
      operatorCode: 'AIRTEL',
    );

    expect(adapter.last?.path, '/subscriptions/request');
    expect(adapter.last?.method, 'POST');
    expect(adapter.last?.data, {'planId': 'plan-id', 'operatorCode': 'AIRTEL'});
  });

  test('defaults carrier fields when an older API omits them', () async {
    final repository = BillingRepository(
      Dio()..httpClientAdapter = _BillingAdapter(),
    );

    final overview = await repository.getSubscription();

    expect(overview.carrierStatus, isNull);
    expect(overview.operatorPlanMissing, isFalse);
    expect(overview.cancelInstructions.smsKeyword, 'STOP kaaj');
    expect(overview.cancelInstructions.shortCode, '21213');
    expect(overview.cancelInstructions.inApp, isTrue);
  });

  test('parses carrier status, cancel instructions and plan gaps', () async {
    for (final (wire, parsed) in [
      ('REGISTERED', CarrierStatus.registered),
      ('UNREGISTERED', CarrierStatus.unregistered),
      ('CHARGE_PENDING', CarrierStatus.chargePending),
      ('SOMETHING_NEW', null),
    ]) {
      final api = FakeApi()
        ..on(
          'GET /subscriptions/me',
          FakeResponse.data(
            _overview(
              carrierStatus: wire,
              operatorPlanMissing: true,
              cancelInstructions: {
                'smsKeyword': 'STOP test',
                'shortCode': '16000',
                'inApp': false,
              },
            ),
          ),
        );
      final overview = await BillingRepository(api.dio()).getSubscription();

      expect(overview.carrierStatus, parsed, reason: wire);
      expect(overview.operatorPlanMissing, isTrue);
      expect(overview.cancelInstructions.smsKeyword, 'STOP test');
      expect(overview.cancelInstructions.shortCode, '16000');
      expect(overview.cancelInstructions.inApp, isFalse);
    }
  });

  test('builds a percent encoded SMS link and rejects odd short codes', () {
    expect(
      const CancelInstructions().smsUri.toString(),
      'sms:21213?body=STOP%20kaaj',
    );
    final unsafe = CancelInstructions.fromJson(const {
      'smsKeyword': '  ',
      'shortCode': '21213&body=x',
    });
    expect(unsafe.smsKeyword, 'STOP kaaj');
    expect(unsafe.shortCode, '21213');
  });

  test('cancel returns the refreshed overview on success', () async {
    final api = FakeApi()
      ..on(
        'POST /subscriptions/cancel',
        FakeResponse.data(
          _overview(carrierStatus: 'UNREGISTERED', accessActive: false),
        ),
      );

    final overview = await BillingRepository(api.dio()).cancelSubscription();

    expect(api.called('POST /subscriptions/cancel'), hasLength(1));
    expect(overview?.accessActive, isFalse);
    expect(overview?.carrierStatus, CarrierStatus.unregistered);
  });

  test('cancel maps the carrier failure with SMS instructions', () async {
    final api = FakeApi()
      ..on(
        'POST /subscriptions/cancel',
        FakeResponse.error(
          503,
          'OPERATOR_UNSUBSCRIBE_FAILED',
          details: [
            {'smsKeyword': 'STOP kaaj', 'shortCode': '21213'},
          ],
        ),
      );

    final failure = await BillingRepository(api.dio())
        .cancelSubscription()
        .then<Failure?>(
          (_) => null,
          onError: (Object error) => error as Failure,
        );

    expect(failure?.code, 'OPERATOR_UNSUBSCRIBE_FAILED');
    expect(failure?.kind, FailureKind.server);
    final instructions = CancelInstructions.fromDetails(failure!.details);
    expect(instructions?.smsKeyword, 'STOP kaaj');
    expect(instructions?.shortCode, '21213');
  });

  test('keeps job cash payment history separate', () async {
    final adapter = _BillingAdapter();
    final repository = BillingRepository(Dio()..httpClientAdapter = adapter);

    final payments = await repository.getJobPayments();

    expect(payments.single.status, 'CASH_RECORDED');
    expect(payments.single.assignmentId, 'assignment-id');
  });
}

Map<String, dynamic> _overview({
  String? carrierStatus,
  bool accessActive = true,
  bool operatorPlanMissing = false,
  Map<String, dynamic>? cancelInstructions,
}) => {
  'accessActive': accessActive,
  'gateEnabled': true,
  'onlinePaymentsEnabled': false,
  'workerWithdrawalsEnabled': false,
  'operatorStatusRefreshFailed': false,
  'operatorPlanMissing': operatorPlanMissing,
  'carrierStatus': carrierStatus,
  'cancelInstructions': ?cancelInstructions,
  'operator': null,
  'current': null,
  'plans': <Object>[],
  'operators': <Object>[],
};

class _BillingAdapter implements HttpClientAdapter {
  RequestOptions? last;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    last = options;
    final data = options.path == '/payments/history'
        ? {
            'items': [
              {
                'id': 'payment-id',
                'assignmentId': 'assignment-id',
                'jobTitle': 'Delivery',
                'role': 'CUSTOMER',
                'agreedPoisha': '10000',
                'currency': 'BDT',
                'method': 'CASH_ON_COMPLETION',
                'status': 'CASH_RECORDED',
                'cashRecordedAt': '2026-09-05T12:00:00.000Z',
                'createdAt': '2026-09-05T11:00:00.000Z',
              },
            ],
          }
        : {
            'accessActive': true,
            'gateEnabled': false,
            'onlinePaymentsEnabled': false,
            'workerWithdrawalsEnabled': false,
            'operator': {
              'status': 'PENDING',
              'operator': {
                'code': 'ROBI',
                'nameEn': 'Robi',
                'nameBn': 'রবি',
                'supportsSubscription': true,
              },
            },
            'current': null,
            'plans': <Object>[],
            'operators': [
              {'code': 'AIRTEL', 'nameEn': 'Airtel', 'nameBn': 'এয়ারটেল'},
              {'code': 'ROBI', 'nameEn': 'Robi', 'nameBn': 'রবি'},
            ],
          };
    return ResponseBody.fromString(
      jsonEncode({'data': data}),
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}
