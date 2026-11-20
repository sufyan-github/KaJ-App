import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/session/user_session.dart';
import '../../../auth/presentation/controllers/auth_providers.dart';
import '../../data/jobs_repository.dart';
import '../../domain/job_models.dart';

final jobsRepositoryProvider = Provider<JobsRepository>((ref) {
  ref.watch(sessionEpochProvider);
  return JobsRepository(ref.watch(dioProvider));
});

class JobFeedFilter {
  const JobFeedFilter({
    this.categoryId,
    this.skillId,
    this.locationId,
    this.availableOnly = false,
    this.forMe = true,
    this.query,
  });

  final bool availableOnly;
  final String? categoryId;
  final bool forMe;

  /// Only jobs in this area (the person's own area for "Near you").
  final String? locationId;
  final String? skillId;

  /// Text search on title and description (`q`, 2–100 characters).
  final String? query;

  @override
  bool operator ==(Object other) =>
      other is JobFeedFilter &&
      other.query == query &&
      other.categoryId == categoryId &&
      other.skillId == skillId &&
      other.locationId == locationId &&
      other.availableOnly == availableOnly &&
      other.forMe == forMe;

  @override
  int get hashCode =>
      Object.hash(categoryId, skillId, locationId, availableOnly, forMe, query);
}

final jobFeedProvider = FutureProvider.family<List<JobSummary>, JobFeedFilter>(
  (ref, filter) => ref
      .watch(jobsRepositoryProvider)
      .getJobs(
        categoryId: filter.categoryId,
        skillId: filter.skillId,
        locationId: filter.locationId,
        availableOnly: filter.availableOnly,
        forMe: filter.forMe,
        query: filter.query,
      ),
);

final jobDetailProvider = FutureProvider.family<JobDetail, String>(
  (ref, id) => ref.watch(jobsRepositoryProvider).getJob(id),
);

final jobAlertsProvider = FutureProvider<List<JobAlert>>(
  (ref) => ref.watch(jobsRepositoryProvider).jobAlerts(),
);

final myJobsProvider = FutureProvider<List<JobSummary>>(
  (ref) => ref.watch(jobsRepositoryProvider).getMyJobs(),
);

final jobApplicationsProvider =
    FutureProvider.family<List<JobApplicationSummary>, String>(
      (ref, jobId) => ref.watch(jobsRepositoryProvider).getApplications(jobId),
    );

final suggestedWorkersProvider =
    FutureProvider.family<List<SuggestedWorker>, String>(
      (ref, jobId) =>
          ref.watch(jobsRepositoryProvider).getSuggestedWorkers(jobId),
    );

// Assignments change on the other person's phone (check-in, submit,
// complete), so they are never kept once no screen shows them: opening the
// list or a detail again always asks the server.
final assignmentsProvider = FutureProvider.autoDispose<List<AssignmentSummary>>(
  (ref) => ref.watch(jobsRepositoryProvider).getAssignments(),
);

final assignmentDetailProvider = FutureProvider.autoDispose
    .family<AssignmentDetail, String>(
      (ref, id) => ref.watch(jobsRepositoryProvider).getAssignment(id),
    );

/// Re-reads one assignment (or all of them) from the server.
void refreshAssignments(WidgetRef ref, [String? id]) {
  ref.invalidate(assignmentsProvider);
  if (id == null) {
    ref
      ..invalidate(assignmentDetailProvider)
      ..invalidate(assignmentReviewsProvider);
  } else {
    ref
      ..invalidate(assignmentDetailProvider(id))
      ..invalidate(assignmentReviewsProvider(id));
  }
}

final assignmentReviewsProvider = FutureProvider.autoDispose
    .family<AssignmentReviewState, String>(
      (ref, id) => ref.watch(jobsRepositoryProvider).getAssignmentReviews(id),
    );

final receivedReviewsProvider = FutureProvider<List<AssignmentReview>>(
  (ref) => ref.watch(jobsRepositoryProvider).getReceivedReviews(),
);

final favoriteWorkersProvider = FutureProvider<List<FavoriteWorker>>(
  (ref) => ref.watch(jobsRepositoryProvider).getFavorites(),
);

final workerSlotsProvider = FutureProvider.family<List<WorkerSlot>, String>(
  (ref, workerId) => ref.watch(jobsRepositoryProvider).getWorkerSlots(workerId),
);
