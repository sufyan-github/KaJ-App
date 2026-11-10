import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../auth/presentation/controllers/auth_providers.dart';
import '../../data/my_profile_repository.dart';
import '../../domain/my_profile.dart';

final myProfileRepositoryProvider = Provider<MyProfileRepository>(
  (ref) => MyProfileRepository(ref.watch(dioProvider)),
);

final myProfileProvider = FutureProvider<MyProfile>(
  (ref) => ref.watch(myProfileRepositoryProvider).me(),
);
