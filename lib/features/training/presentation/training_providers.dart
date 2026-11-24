import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_ce_flutter/hive_flutter.dart';

import '../../../core/session/user_session.dart';
import '../../auth/presentation/controllers/auth_providers.dart';
import '../../onboarding/data/onboarding_repository.dart';
import '../../settings/presentation/settings_providers.dart';
import '../data/training_offer_store.dart';
import '../data/training_repository.dart';
import '../domain/training_models.dart';
import 'widgets/lesson_video_request.dart';
import 'widgets/youtube_lesson_player.dart';

final trainingRepositoryProvider = Provider<TrainingRepository>((ref) {
  ref.watch(sessionEpochProvider);
  return TrainingRepository(ref.watch(dioProvider));
});

final trainingCoursesProvider =
    FutureProvider.family<List<CourseSummary>, CourseScope>(
      (ref, scope) =>
          ref.watch(trainingRepositoryProvider).courses(scope: scope),
    );

final courseDetailProvider = FutureProvider.family<CourseDetail, String>(
  (ref, id) => ref.watch(trainingRepositoryProvider).course(id),
);

final lessonCheckpointProvider = FutureProvider.autoDispose
    .family<LessonCheckpoint, String>(
      (ref, lessonId) =>
          ref.watch(trainingRepositoryProvider).checkpoint(lessonId),
    );

final myCertificatesProvider = FutureProvider<List<CertificateSummary>>(
  (ref) => ref.watch(trainingRepositoryProvider).myCertificates(),
);

/// Refreshes everything that shows training state after a test or a lesson.
void invalidateTrainingState(WidgetRef ref, {String? courseId}) {
  ref
    ..invalidate(trainingCoursesProvider)
    ..invalidate(myCertificatesProvider);
  if (courseId != null) ref.invalidate(courseDetailProvider(courseId));
}

final trainingOfferStoreProvider = Provider<TrainingOfferStore>(
  (ref) => HiveTrainingOfferStore(Hive.box<dynamic>(onboardingBoxName)),
);

/// The account the offer memory belongs to, from the server session.
final trainingOwnerIdProvider = FutureProvider<String?>((ref) async {
  final account = await ref.watch(accountSummaryProvider.future);
  return account.id.isEmpty ? null : account.id;
});

/// Whether the server says the active role is worker. Customers never see
/// any training prompt, whatever the local onboarding draft says.
final serverRoleIsWorkerProvider = FutureProvider<bool>((ref) async {
  final account = await ref.watch(accountSummaryProvider.future);
  return account.activeRole == 'WORKER';
});

final trainingClockProvider = Provider<DateTime Function()>(
  (ref) => DateTime.now,
);

/// True when the phone is on mobile data and not on Wi-Fi, so the lesson can
/// warn before a video eats into a prepaid data pack.
final onMobileDataProvider = FutureProvider<bool>((ref) async {
  final results = await Connectivity().checkConnectivity();
  return results.contains(ConnectivityResult.mobile) &&
      !results.contains(ConnectivityResult.wifi) &&
      !results.contains(ConnectivityResult.ethernet);
});

typedef LessonVideoBuilder =
    Widget Function(BuildContext context, LessonVideoRequest request);

/// Builds the embedded player. Widget tests swap it for a plain fake because
/// platform web views do not run there.
final lessonVideoBuilderProvider = Provider<LessonVideoBuilder>(
  (ref) =>
      (context, request) => YoutubeLessonPlayer(request: request),
);
