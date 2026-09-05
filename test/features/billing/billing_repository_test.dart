import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/features/billing/data/billing_repository.dart';

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

  test('keeps job cash payment history separate', () async {
    final adapter = _BillingAdapter();
    final repository = BillingRepository(Dio()..httpClientAdapter = adapter);

    final payments = await repository.getJobPayments();

    expect(payments.single.status, 'CASH_RECORDED');
    expect(payments.single.assignmentId, 'assignment-id');
  });
}

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
