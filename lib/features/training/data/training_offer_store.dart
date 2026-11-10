import 'package:hive_ce_flutter/hive_flutter.dart';

/// What the worker last did with the optional training offer.
enum TrainingOfferAction { none, later, accepted }

class TrainingOfferRecord {
  const TrainingOfferRecord({
    this.timesShown = 0,
    this.lastAction = TrainingOfferAction.none,
    this.lastActionAt,
  });

  factory TrainingOfferRecord.fromJson(Map<dynamic, dynamic> json) =>
      TrainingOfferRecord(
        timesShown: json['timesShown'] is int ? json['timesShown'] as int : 0,
        lastAction: TrainingOfferAction.values.firstWhere(
          (item) => item.name == json['lastAction'],
          orElse: () => TrainingOfferAction.none,
        ),
        lastActionAt: json['lastActionAt'] is String
            ? DateTime.tryParse(json['lastActionAt'] as String)
            : null,
      );

  final TrainingOfferAction lastAction;
  final DateTime? lastActionAt;
  final int timesShown;

  Map<String, dynamic> toJson() => {
    'timesShown': timesShown,
    'lastAction': lastAction.name,
    'lastActionAt': lastActionAt?.toUtc().toIso8601String(),
  };
}

/// The offer is shown once. "Later" earns exactly one more showing, and only
/// after a week has passed. Any other answer ends it for that account.
abstract final class TrainingOfferPolicy {
  static const laterDelay = Duration(days: 7);

  static bool shouldShow(TrainingOfferRecord record, DateTime now) {
    if (record.timesShown == 0) return true;
    if (record.timesShown >= 2) return false;
    final laterAt = record.lastActionAt;
    return record.lastAction == TrainingOfferAction.later &&
        laterAt != null &&
        !now.isBefore(laterAt.add(laterDelay));
  }
}

/// Per-account memory of the training offer.
///
/// Keys carry the account id, the same way onboarding drafts are kept apart,
/// so a second person signing in on a shared phone gets their own offer.
abstract class TrainingOfferStore {
  TrainingOfferRecord read(String ownerId);

  Future<void> write(String ownerId, TrainingOfferRecord record);
}

class HiveTrainingOfferStore implements TrainingOfferStore {
  const HiveTrainingOfferStore(this._box);

  final Box<dynamic> _box;

  static String keyFor(String ownerId) => 'training_offer.$ownerId';

  @override
  TrainingOfferRecord read(String ownerId) {
    final value = _box.get(keyFor(ownerId));
    return value is Map
        ? TrainingOfferRecord.fromJson(value)
        : const TrainingOfferRecord();
  }

  @override
  Future<void> write(String ownerId, TrainingOfferRecord record) =>
      _box.put(keyFor(ownerId), record.toJson());
}

class MemoryTrainingOfferStore implements TrainingOfferStore {
  final records = <String, TrainingOfferRecord>{};

  @override
  TrainingOfferRecord read(String ownerId) =>
      records[ownerId] ?? const TrainingOfferRecord();

  @override
  Future<void> write(String ownerId, TrainingOfferRecord record) async {
    records[ownerId] = record;
  }
}
