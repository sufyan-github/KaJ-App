import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

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

/// Opens a URI in another app. Resolves to false instead of throwing when
/// no app can handle it, so callers can offer a manual fallback.
typedef ExternalUriLauncher = Future<bool> Function(Uri uri);

final externalUriLauncherProvider = Provider<ExternalUriLauncher>(
  (ref) => _launchExternally,
);

Future<bool> _launchExternally(Uri uri) async {
  try {
    return await launchUrl(uri, mode: LaunchMode.externalApplication);
  } on Object {
    return false;
  }
}
