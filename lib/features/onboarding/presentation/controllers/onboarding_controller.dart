import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_ce_flutter/hive_flutter.dart';

import '../../../auth/presentation/controllers/auth_providers.dart';
import '../../data/onboarding_repository.dart';
import '../../domain/onboarding_state.dart';

final onboardingRepositoryProvider = Provider<OnboardingRepository>((ref) {
  return OnboardingRepository(
    ref.watch(dioProvider),
    Hive.box<dynamic>(onboardingBoxName),
    ref.watch(sessionTokenStoreProvider),
  );
});

final onboardingControllerProvider =
    StateNotifierProvider<OnboardingController, OnboardingState>((ref) {
      return OnboardingController(ref.watch(onboardingRepositoryProvider));
    });

class OnboardingController extends StateNotifier<OnboardingState> {
  OnboardingController(this._repository) : super(_repository.restore());

  final OnboardingRepository _repository;

  Future<void> begin() => _save(state.copyWith(started: true, complete: false));

  Future<void> saveProfile(String displayName) async {
    final next = state.copyWith(
      displayName: displayName.trim(),
      started: true,
      complete: false,
      step: 1,
    );
    await _repository.updateProfile(next);
    await _save(next);
  }

  Future<void> selectRole(KaajRole role) async {
    await _repository.activateRole(role);
    await _save(state.copyWith(role: role, step: 2));
  }

  Future<void> selectLocation(String locationId) async {
    final next = state.copyWith(locationId: locationId, step: 3);
    await _repository.updateProfile(next);
    await _save(next);
  }

  Future<void> saveWorkerSetup(
    List<String> skillIds, {
    int? hourlyRatePoisha,
  }) async {
    await _repository.updateWorkerSkills(
      skillIds,
      hourlyRatePoisha: hourlyRatePoisha,
    );
    await _save(state.copyWith(skillIds: skillIds, step: 4));
  }

  Future<void> saveAvailability(
    List<int> days, {
    String startTime = '18:00',
    String endTime = '22:00',
  }) async {
    await _repository.updateAvailability(
      days,
      startTime: startTime,
      endTime: endTime,
    );
    await _save(
      state.copyWith(
        availableDays: days,
        availableStartTime: startTime,
        availableEndTime: endTime,
        step: 5,
      ),
    );
  }

  Future<void> finish() =>
      _save(state.copyWith(complete: true, started: true, step: 6));

  Future<void> _save(OnboardingState next) async {
    state = next;
    await _repository.persist(next);
  }
}
