import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/features/onboarding/domain/onboarding_state.dart';

void main() {
  test('onboarding draft survives serialization for app relaunch', () {
    const draft = OnboardingState(
      started: true,
      step: 4,
      displayName: 'রহিম',
      role: KaajRole.worker,
      locationId: 'area-id',
      skillIds: ['skill-a', 'skill-b'],
      availableDays: [0, 2, 5],
      availableStartTime: '09:30',
      availableEndTime: '16:45',
    );

    final restored = OnboardingState.fromJson(draft.toJson());

    expect(restored.started, isTrue);
    expect(restored.complete, isFalse);
    expect(restored.step, 4);
    expect(restored.displayName, 'রহিম');
    expect(restored.role, KaajRole.worker);
    expect(restored.locationId, 'area-id');
    expect(restored.skillIds, ['skill-a', 'skill-b']);
    expect(restored.availableDays, [0, 2, 5]);
    expect(restored.availableStartTime, '09:30');
    expect(restored.availableEndTime, '16:45');
  });
}
