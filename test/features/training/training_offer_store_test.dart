import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hive_ce_flutter/hive_flutter.dart';
import 'package:kaaj/features/training/data/training_offer_store.dart';

void main() {
  final now = DateTime.utc(2026, 11, 11, 9);

  test('first showing is allowed and a refusal ends it', () {
    expect(
      TrainingOfferPolicy.shouldShow(const TrainingOfferRecord(), now),
      isTrue,
    );
    expect(
      TrainingOfferPolicy.shouldShow(
        TrainingOfferRecord(
          timesShown: 1,
          lastAction: TrainingOfferAction.accepted,
          lastActionAt: now,
        ),
        now.add(const Duration(days: 30)),
      ),
      isFalse,
    );
  });

  test('later re-shows once, only after seven days', () {
    final later = TrainingOfferRecord(
      timesShown: 1,
      lastAction: TrainingOfferAction.later,
      lastActionAt: now,
    );
    expect(
      TrainingOfferPolicy.shouldShow(later, now.add(const Duration(days: 6))),
      isFalse,
    );
    expect(
      TrainingOfferPolicy.shouldShow(later, now.add(const Duration(days: 7))),
      isTrue,
    );
    expect(
      TrainingOfferPolicy.shouldShow(
        TrainingOfferRecord(
          timesShown: 2,
          lastAction: TrainingOfferAction.later,
          lastActionAt: now,
        ),
        now.add(const Duration(days: 60)),
      ),
      isFalse,
    );
  });

  test('records are kept per account in Hive', () async {
    final directory = await Directory.systemTemp.createTemp('kaaj_offer_');
    Hive.init(directory.path);
    final box = await Hive.openBox<dynamic>('offer_test');
    addTearDown(() async {
      await box.close();
      await directory.delete(recursive: true);
    });
    final store = HiveTrainingOfferStore(box);

    await store.write(
      'user-a',
      TrainingOfferRecord(
        timesShown: 1,
        lastAction: TrainingOfferAction.later,
        lastActionAt: now,
      ),
    );

    final a = store.read('user-a');
    expect(a.timesShown, 1);
    expect(a.lastAction, TrainingOfferAction.later);
    expect(a.lastActionAt, now);
    expect(store.read('user-b').timesShown, 0);
  });
}
