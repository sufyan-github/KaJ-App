import 'package:dio/dio.dart';

import '../../../core/errors/error_mapper.dart';
import '../domain/billing_models.dart';

class BillingRepository {
  const BillingRepository(this._dio);

  final Dio _dio;

  Future<SubscriptionOverview> getSubscription() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/subscriptions/me',
      );
      return SubscriptionOverview.fromJson(_data(response.data));
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  Future<SubscriptionOverview> requestSubscription({
    required String planId,
    required String operatorCode,
  }) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/subscriptions/request',
        data: {'planId': planId, 'operatorCode': operatorCode},
      );
      return SubscriptionOverview.fromJson(_data(response.data));
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  Future<void> cancelSubscription() async {
    try {
      await _dio.post<Map<String, dynamic>>('/subscriptions/cancel');
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  Future<List<JobPaymentRecord>> getJobPayments() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/payments/history',
      );
      final items = _data(response.data)['items'];
      return items is List
          ? items
                .whereType<Map>()
                .map(
                  (item) => JobPaymentRecord.fromJson(
                    Map<String, dynamic>.from(item),
                  ),
                )
                .toList(growable: false)
          : const [];
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  Map<String, dynamic> _data(Map<String, dynamic>? envelope) {
    final data = envelope?['data'];
    if (data is Map) return Map<String, dynamic>.from(data);
    throw const FormatException('Missing response data');
  }
}
