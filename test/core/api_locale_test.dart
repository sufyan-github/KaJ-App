import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/bootstrap.dart';
import 'package:kaaj/core/config/app_environment.dart';
import 'package:kaaj/core/localization/locale_controller.dart';
import 'package:kaaj/core/network/api_locale.dart';
import 'package:kaaj/features/auth/presentation/controllers/auth_providers.dart';

void main() {
  const environment = AppEnvironment(
    flavor: AppFlavor.dev,
    apiBaseUrl: 'https://api.test/api/v1',
    sentryDsn: '',
  );

  ProviderContainer containerWith() => ProviderContainer(
    overrides: [appEnvironmentProvider.overrideWithValue(environment)],
  );

  test('Accept-Language follows the locale without replacing the client', () {
    final container = containerWith();
    addTearDown(container.dispose);

    final dio = container.read(dioProvider);
    final apiLocale = container.read(apiLocaleProvider);
    expect(apiLocale.languageCode, 'bn');

    container
        .read(localeControllerProvider.notifier)
        .setLocale(const Locale('en'));

    expect(apiLocale.languageCode, 'en');
    // The same Dio instance must survive: rebuilding it would tear down the
    // auth controller and every repository cache underneath it.
    expect(identical(container.read(dioProvider), dio), isTrue);
  });

  test('switching language leaves the session provider untouched', () {
    final container = containerWith();
    addTearDown(container.dispose);

    final before = container.read(authControllerProvider);
    final controller = container.read(authControllerProvider.notifier);

    container
        .read(localeControllerProvider.notifier)
        .setLocale(const Locale('en'));

    expect(
      identical(container.read(authControllerProvider.notifier), controller),
      isTrue,
    );
    expect(container.read(authControllerProvider).status, before.status);
  });

  test('an empty language code is ignored rather than clearing the header', () {
    final apiLocale = ApiLocale('bn');
    apiLocale.languageCode = '';
    expect(apiLocale.languageCode, 'bn');
  });
}
