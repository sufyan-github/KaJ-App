import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/session/user_session.dart';
import '../../auth/presentation/controllers/auth_providers.dart';
import '../../profile/presentation/controllers/me_provider.dart';
import '../data/learning_repository.dart';
import '../domain/learning_models.dart';

final learningRepositoryProvider = Provider<LearningRepository>((ref) {
  ref.watch(sessionEpochProvider);
  return LearningRepository(ref.watch(dioProvider));
});

/// Filters for Explore → Learn.
class LearningFilter {
  const LearningFilter({this.kind, this.terms, this.mode});

  final LearningKind? kind;
  final DeliveryMode? mode;
  final ParticipantTerms? terms;

  @override
  bool operator ==(Object other) =>
      other is LearningFilter &&
      other.kind == kind &&
      other.terms == terms &&
      other.mode == mode;

  @override
  int get hashCode => Object.hash(kind, terms, mode);
}

final learningFeedProvider = FutureProvider.autoDispose
    .family<List<LearningOpportunity>, LearningFilter>(
      (ref, filter) => ref
          .watch(learningRepositoryProvider)
          .feed(kind: filter.kind, terms: filter.terms, mode: filter.mode),
    );

final learningDetailProvider = FutureProvider.autoDispose
    .family<LearningOpportunity, String>(
      (ref, id) => ref.watch(learningRepositoryProvider).detail(id),
    );

final myLearningOpportunitiesProvider =
    FutureProvider.autoDispose<List<LearningOpportunity>>(
      (ref) => ref.watch(learningRepositoryProvider).mine(),
    );

/// Open learning opportunities in the skills on the persons profile, for
/// the Home training card. Empty when they have no skills yet.
final learningForMySkillsProvider =
    FutureProvider.autoDispose<List<LearningOpportunity>>((ref) async {
      final me = await ref.watch(meProvider.future);
      final mine = {for (final skill in me.skills) skill.skillId};
      if (mine.isEmpty) return const [];
      final feed = await ref.watch(learningRepositoryProvider).feed();
      return feed
          .where((item) => item.skillIds.any(mine.contains))
          .take(2)
          .toList(growable: false);
    });

final learningApplicationsProvider = FutureProvider.autoDispose
    .family<List<LearningApplication>, String>(
      (ref, id) => ref.watch(learningRepositoryProvider).applications(id),
    );

final learningEnrolmentsProvider =
    FutureProvider.autoDispose<List<LearningEnrolment>>(
      (ref) => ref.watch(learningRepositoryProvider).enrolments(),
    );

final learningEnrolmentProvider = FutureProvider.autoDispose
    .family<LearningEnrolment, String>(
      (ref, id) => ref.watch(learningRepositoryProvider).enrolment(id),
    );
