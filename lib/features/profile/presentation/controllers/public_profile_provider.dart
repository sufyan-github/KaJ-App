import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../auth/presentation/controllers/auth_providers.dart';
import '../../data/public_profile_repository.dart';
import '../../domain/public_worker_profile.dart';

final publicProfileRepositoryProvider = Provider<PublicProfileRepository>(
  (ref) => PublicProfileRepository(ref.watch(dioProvider)),
);

final myPublicWorkerProfileProvider = FutureProvider<PublicWorkerProfile>(
  (ref) =>
      ref.watch(publicProfileRepositoryProvider).getMyPublicWorkerProfile(),
);
