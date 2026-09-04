import 'package:dio/dio.dart';
import 'package:hive_ce_flutter/hive_flutter.dart';

import '../../../core/storage/session_token_store.dart';
import '../domain/availability_schedule.dart';
import '../domain/onboarding_state.dart';

const onboardingBoxName = 'kaaj_onboarding_v1';

class OnboardingRepository {
  const OnboardingRepository(this._dio, this._box, [this._tokens]);

  final Dio _dio;
  final Box<dynamic> _box;
  final SessionTokenStore? _tokens;

  OnboardingState restore() {
    final value = _box.get('draft');
    return value is Map
        ? OnboardingState.fromJson(value)
        : const OnboardingState();
  }

  Future<void> persist(OnboardingState state) =>
      _box.put('draft', state.toJson());

  Future<void> updateProfile(OnboardingState state) async {
    await _dio.put<Map<String, dynamic>>(
      '/profiles/me',
      data: {
        'displayName': state.displayName,
        if (state.locationId != null) 'primaryLocationId': state.locationId,
      },
    );
  }

  Future<void> activateRole(KaajRole role) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/me/roles/activate',
      data: {'role': role.name.toUpperCase()},
    );
    final body = response.data;
    final data = body?['data'];
    if (data is Map && data['accessToken'] is String) {
      _tokens?.saveAccessToken(data['accessToken'] as String);
    }
  }

  Future<void> updateWorkerSkills(
    List<String> skillIds, {
    int? hourlyRatePoisha,
  }) async {
    await _dio.put<Map<String, dynamic>>(
      '/profiles/me/skills',
      data: {
        'skills': skillIds
            .map((id) => {'skillId': id, 'level': 'BEGINNER'})
            .toList(growable: false),
      },
    );
    await _dio.put<Map<String, dynamic>>(
      '/profiles/me/worker',
      data: {'hourlyRatePoisha': hourlyRatePoisha},
    );
  }

  Future<void> updateAvailability(
    List<int> days, {
    required String startTime,
    required String endTime,
  }) => replaceAvailability(
    days
        .map(
          (day) => AvailabilityRule(
            dayOfWeek: day,
            startTime: startTime,
            endTime: endTime,
          ),
        )
        .toList(growable: false),
  );

  Future<AvailabilitySchedule> getAvailability() async {
    final response = await _runAsWorker(
      () => _dio.get<Map<String, dynamic>>('/profiles/me/availability'),
    );
    final data = response.data?['data'];
    if (data is! Map) throw const FormatException('Missing availability data');
    return AvailabilitySchedule.fromJson(Map<String, dynamic>.from(data));
  }

  Future<void> replaceAvailability(List<AvailabilityRule> rules) async {
    await _runAsWorker(
      () => _dio.put<Map<String, dynamic>>(
        '/profiles/me/availability',
        data: {
          'rules': rules.map((rule) => rule.toJson()).toList(growable: false),
        },
      ),
    );
  }

  Future<void> addAvailabilityWindow(DateTime startsAt, DateTime endsAt) async {
    final schedule = await getAvailability();
    final localStart = startsAt.toUtc().add(const Duration(hours: 6));
    final localEnd = endsAt.toUtc().add(const Duration(hours: 6));
    final dayOfWeek = localStart.weekday % 7;
    final startTime = _time(localStart);
    final endTime = _time(localEnd);
    final alreadyCovered = schedule.rules.any(
      (rule) =>
          rule.dayOfWeek == dayOfWeek &&
          _minutes(rule.startTime) <= _minutes(startTime) &&
          _minutes(rule.endTime) >= _minutes(endTime),
    );
    if (alreadyCovered) return;
    await replaceAvailability([
      ...schedule.rules,
      AvailabilityRule(
        dayOfWeek: dayOfWeek,
        startTime: startTime,
        endTime: endTime,
      ),
    ]);
  }

  static String _time(DateTime value) =>
      '${value.hour.toString().padLeft(2, '0')}:${value.minute.toString().padLeft(2, '0')}';

  static int _minutes(String value) {
    final parts = value.split(':');
    return int.parse(parts[0]) * 60 + int.parse(parts[1]);
  }

  Future<Response<Map<String, dynamic>>> _runAsWorker(
    Future<Response<Map<String, dynamic>>> Function() request,
  ) async {
    try {
      return await request();
    } on DioException catch (error) {
      if (error.response?.statusCode != 403) rethrow;
      await activateRole(KaajRole.worker);
      return request();
    }
  }
}
