import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_ce_flutter/hive_flutter.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

import 'app.dart';
import 'core/config/app_environment.dart';

Future<void> bootstrap() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Hive.initFlutter();
  final environment = AppEnvironment.current();

  Future<void> start() async {
    runApp(
      ProviderScope(
        overrides: [appEnvironmentProvider.overrideWithValue(environment)],
        child: const KaajApp(),
      ),
    );
  }

  if (environment.sentryDsn.isEmpty) {
    await runZonedGuarded(start, (error, stackTrace) {
      FlutterError.reportError(
        FlutterErrorDetails(exception: error, stack: stackTrace),
      );
    });
    return;
  }

  await SentryFlutter.init((options) {
    options
      ..dsn = environment.sentryDsn
      ..sendDefaultPii = false
      ..environment = environment.flavor.name;
  }, appRunner: start);
}

final appEnvironmentProvider = Provider<AppEnvironment>(
  (ref) => throw StateError('AppEnvironment was not initialized.'),
);
