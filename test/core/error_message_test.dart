import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/errors/failure.dart';
import 'package:kaaj/core/widgets/k_error_message.dart';
import 'package:kaaj/l10n/generated/app_localizations.dart';

void main() {
  testWidgets('known backend errors render localized Bangla copy', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        locale: Locale('bn'),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
        ],
        home: Scaffold(
          body: KErrorMessage(
            failure: Failure(
              kind: FailureKind.unauthorized,
              code: 'OTP_INVALID',
              message: 'The OTP is incorrect.',
            ),
          ),
        ),
      ),
    );

    expect(find.text('যাচাই কোডটি সঠিক নয়।'), findsOneWidget);
    expect(find.text('The OTP is incorrect.'), findsNothing);
  });
}
