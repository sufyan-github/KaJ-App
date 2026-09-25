import 'package:flutter/services.dart';

enum AppFlavor { dev, staging, prod }

class AppEnvironment {
  const AppEnvironment({
    required this.flavor,
    required this.apiBaseUrl,
    required this.sentryDsn,
    this.sentryRelease = '',
  });

  factory AppEnvironment.current() {
    final flavor = switch (appFlavor) {
      'staging' => AppFlavor.staging,
      'prod' => AppFlavor.prod,
      _ => AppFlavor.dev,
    };
    const suppliedApiBase = String.fromEnvironment('API_BASE_URL');
    const sentryDsn = String.fromEnvironment('SENTRY_DSN');
    const sentryRelease = String.fromEnvironment('SENTRY_RELEASE');
    final defaultBase = switch (flavor) {
      AppFlavor.dev => 'https://api-dev.kaaj.app/api/v1',
      AppFlavor.staging => 'https://api-staging.kaaj.app/api/v1',
      AppFlavor.prod => 'https://api.kaaj.app/api/v1',
    };
    return AppEnvironment(
      flavor: flavor,
      apiBaseUrl: suppliedApiBase.isEmpty ? defaultBase : suppliedApiBase,
      sentryDsn: sentryDsn,
      sentryRelease: sentryRelease,
    );
  }

  final AppFlavor flavor;
  final String apiBaseUrl;
  final String sentryDsn;
  final String sentryRelease;

  bool get showDebugBanner => flavor != AppFlavor.prod;
}
