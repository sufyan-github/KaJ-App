import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../auth/presentation/controllers/auth_providers.dart';
import '../../data/jobs_repository.dart';
import '../../domain/job_models.dart';

final jobsRepositoryProvider = Provider<JobsRepository>(
  (ref) => JobsRepository(ref.watch(dioProvider)),
);

final jobFeedProvider = FutureProvider<List<JobSummary>>(
  (ref) => ref.watch(jobsRepositoryProvider).getJobs(),
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

final assignmentsProvider = FutureProvider<List<AssignmentSummary>>(
  (ref) => ref.watch(jobsRepositoryProvider).getAssignments(),
);

final assignmentDetailProvider =
    FutureProvider.family<AssignmentDetail, String>(
      (ref, id) => ref.watch(jobsRepositoryProvider).getAssignment(id),
    );

final assignmentReviewsProvider =
    FutureProvider.family<AssignmentReviewState, String>(
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
