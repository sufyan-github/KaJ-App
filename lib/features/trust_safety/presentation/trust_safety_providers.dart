import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/location/location_gateway.dart';
import '../../auth/presentation/controllers/auth_providers.dart';
import '../data/trust_safety_repository.dart';
import '../domain/trust_models.dart';

final trustSafetyRepositoryProvider = Provider<TrustSafetyRepository>(
  (ref) => TrustSafetyRepository(ref.watch(dioProvider)),
);
final locationGatewayProvider = Provider<LocationGateway>(
  (ref) => const LocationGateway(),
);
final verificationRequestsProvider = FutureProvider<List<VerificationRequest>>(
  (ref) => ref.watch(trustSafetyRepositoryProvider).verificationRequests(),
);
final attendanceProvider = FutureProvider.family<AttendanceState, String>(
  (ref, id) => ref.watch(trustSafetyRepositoryProvider).attendance(id),
);
final disputesProvider = FutureProvider<List<DisputeSummary>>(
  (ref) => ref.watch(trustSafetyRepositoryProvider).disputes(),
);
final disputeProvider = FutureProvider.family<DisputeSummary, String>(
  (ref, id) => ref.watch(trustSafetyRepositoryProvider).dispute(id),
);
final blockedUsersProvider = FutureProvider<List<BlockedUser>>(
  (ref) => ref.watch(trustSafetyRepositoryProvider).blockedUsers(),
);
final portfolioProvider = FutureProvider<List<PortfolioItem>>(
  (ref) => ref.watch(trustSafetyRepositoryProvider).portfolio(),
);
