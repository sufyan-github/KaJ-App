import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_ce_flutter/hive_flutter.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

import 'app.dart';
import 'core/config/app_environment.dart';
import 'core/localization/locale_controller.dart';
import 'features/onboarding/data/onboarding_repository.dart';

Future<void> bootstrap() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Without this, every DateFormat falls back to `en_US` and Bangla screens
  // print English month names and Latin digits.
  await initializeDateFormatting('bn_BD');
  await initializeDateFormatting('en');
  await Hive.initFlutter();
  await Hive.openBox<dynamic>(onboardingBoxName);
  await Hive.openBox<dynamic>('kaaj_chat');
  await Hive.openBox<dynamic>(localePreferencesBoxName);
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
    PlatformDispatcher.instance.onError = (error, stackTrace) {
      FlutterError.reportError(
        FlutterErrorDetails(exception: error, stack: stackTrace),
      );
      return true;
    };
    await start();
    return;
  }

  await SentryFlutter.init((options) {
    options
      ..dsn = environment.sentryDsn
      ..sendDefaultPii = false
      ..environment = environment.flavor.name;
    if (environment.sentryRelease.isNotEmpty) {
      options.release = environment.sentryRelease;
    }
  }, appRunner: start);
}

final appEnvironmentProvider = Provider<AppEnvironment>(
  (ref) => throw StateError('AppEnvironment was not initialized.'),
);
