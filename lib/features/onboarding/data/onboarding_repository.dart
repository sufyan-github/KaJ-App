import 'package:dio/dio.dart';
import 'package:hive_ce_flutter/hive_flutter.dart';

import '../domain/onboarding_state.dart';

const onboardingBoxName = 'kaaj_onboarding_v1';

class OnboardingRepository {
  const OnboardingRepository(this._dio, this._box);

  final Dio _dio;
  final Box<dynamic> _box;

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
    await _dio.post<Map<String, dynamic>>(
      '/me/roles/activate',
      data: {'role': role.name.toUpperCase()},
    );
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

  Future<void> updateAvailability(List<int> days) async {
    await _dio.put<Map<String, dynamic>>(
      '/profiles/me/availability',
      data: {
        'rules': days
            .map(
              (day) => {
                'dayOfWeek': day,
                'startTime': '18:00',
                'endTime': '22:00',
              },
            )
            .toList(growable: false),
      },
    );
  }
}
