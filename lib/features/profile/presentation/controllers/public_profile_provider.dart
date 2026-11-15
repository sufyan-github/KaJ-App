import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/session/user_session.dart';
import '../../../auth/presentation/controllers/auth_providers.dart';
import '../../data/public_profile_repository.dart';
import '../../domain/public_worker_profile.dart';

final publicProfileRepositoryProvider = Provider<PublicProfileRepository>((
  ref,
) {
  ref.watch(sessionEpochProvider);
  return PublicProfileRepository(ref.watch(dioProvider));
});

final myPublicWorkerProfileProvider = FutureProvider<PublicWorkerProfile>(
  (ref) =>
      ref.watch(publicProfileRepositoryProvider).getMyPublicWorkerProfile(),
);

final workerDirectoryProvider = FutureProvider<List<PublicWorkerProfile>>(
  (ref) => ref.watch(publicProfileRepositoryProvider).listWorkers(),
);

final publicWorkerProfileProvider =
    FutureProvider.family<PublicWorkerProfile, String>(
      (ref, workerId) =>
          ref.watch(publicProfileRepositoryProvider).getWorkerProfile(workerId),
    );
