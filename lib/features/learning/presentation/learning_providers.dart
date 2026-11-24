import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/session/user_session.dart';
import '../../auth/presentation/controllers/auth_providers.dart';
import '../../jobs/domain/job_models.dart';
import '../../profile/presentation/controllers/me_provider.dart';
import '../data/learning_repository.dart';
import '../domain/learning_models.dart';

final learningRepositoryProvider = Provider<LearningRepository>((ref) {
  ref.watch(sessionEpochProvider);
  return LearningRepository(ref.watch(dioProvider));
});

final learningFeedProvider = FutureProvider.autoDispose
    .family<List<LearningOpportunity>, LearningFilter>(
      (ref, filter) => ref.watch(learningRepositoryProvider).feedPage(filter),
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
      // Ask the server per skill (up to three) so a match beyond the first
      // page of the whole feed is still found.
      final repository = ref.watch(learningRepositoryProvider);
      final pages = await Future.wait([
        for (final skillId in mine.take(3)) repository.feed(skillId: skillId),
      ]);
      final seen = <String>{};
      return [
        for (final page in pages)
          for (final item in page)
            if (item.skillIds.any(mine.contains) && seen.add(item.id)) item,
      ].take(2).toList(growable: false);
    });

final learningApplicationsProvider = FutureProvider.autoDispose
    .family<List<LearningApplication>, String>(
      (ref, id) => ref.watch(learningRepositoryProvider).applications(id),
    );

final myLearningApplicationsProvider =
    FutureProvider.autoDispose<List<MyLearningApplication>>(
      (ref) => ref.watch(learningRepositoryProvider).myApplications(),
    );

final learningEnrolmentsProvider =
    FutureProvider.autoDispose<List<LearningEnrolment>>(
      (ref) => ref.watch(learningRepositoryProvider).enrolments(),
    );

final learningEnrolmentProvider = FutureProvider.autoDispose
    .family<LearningEnrolment, String>(
      (ref, id) => ref.watch(learningRepositoryProvider).enrolment(id),
    );

final learningReviewStateProvider = FutureProvider.autoDispose
    .family<AssignmentReviewState, String>(
      (ref, id) => ref.watch(learningRepositoryProvider).reviewState(id),
    );
