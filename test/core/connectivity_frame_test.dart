import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/connectivity/app_connectivity_frame.dart';
import 'package:kaaj/core/connectivity/connectivity_service.dart';
import 'package:kaaj/l10n/generated/app_localizations.dart';

void main() {
  testWidgets('offline connectivity state renders the persistent banner', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          isOnlineProvider.overrideWith((ref) => Stream.value(false)),
        ],
        child: const MaterialApp(
          locale: Locale('en'),
          supportedLocales: AppLocalizations.supportedLocales,
          localizationsDelegates: [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
          ],
          home: Scaffold(
            body: AppConnectivityFrame(child: Text('Cached content')),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.text('You are offline. Some information may be out of date.'),
      findsOneWidget,
    );
    expect(find.text('Cached content'), findsOneWidget);
  });
}
