import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/presentation/controllers/auth_providers.dart';
import '../data/billing_repository.dart';
import '../domain/billing_models.dart';

final billingRepositoryProvider = Provider<BillingRepository>(
  (ref) => BillingRepository(ref.watch(dioProvider)),
);

final subscriptionOverviewProvider = FutureProvider<SubscriptionOverview>(
  (ref) => ref.watch(billingRepositoryProvider).getSubscription(),
);

final jobPaymentsProvider = FutureProvider<List<JobPaymentRecord>>(
  (ref) => ref.watch(billingRepositoryProvider).getJobPayments(),
);
