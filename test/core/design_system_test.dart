import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/errors/failure.dart';
import 'package:kaaj/core/theme/app_theme.dart';
import 'package:kaaj/core/widgets/k_card.dart';
import 'package:kaaj/core/widgets/k_empty_state.dart';
import 'package:kaaj/core/widgets/k_error_state.dart';
import 'package:kaaj/core/widgets/k_offline_banner.dart';
import 'package:kaaj/core/widgets/k_primary_button.dart';
import 'package:kaaj/core/widgets/k_text_field.dart';

void main() {
  for (final scale in [1.0, 1.5, 2.0]) {
    testWidgets('shared components render at ${scale}x text on 320dp', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(960, 1920);
      tester.view.devicePixelRatio = 3;
      tester.platformDispatcher.textScaleFactorTestValue = scale;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

      await tester.pumpWidget(
        MaterialApp(
          theme: buildAppTheme(),
          home: Scaffold(
            body: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const KOfflineBanner(message: 'No connection'),
                const KCard(child: Text('A trustworthy marketplace surface')),
                const KTextField(
                  label: 'Mobile number',
                  helperText: 'Use a Bangladesh mobile number',
                ),
                KPrimaryButton(label: 'Continue', onPressed: () {}),
                KEmptyState(
                  icon: Icons.work_outline,
                  title: 'No matching work yet',
                  message:
                      'Update your skills or service area and check again.',
                  actionLabel: 'Update skills',
                  onAction: () {},
                ),
                KErrorState(
                  failure: const Failure(
                    kind: FailureKind.network,
                    message:
                        'No internet. Check your connection and try again.',
                    requestId: 'request-id',
                  ),
                  retryLabel: 'Try again',
                  onRetry: () {},
                ),
              ],
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      expect(find.text('Continue'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('Try again'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      expect(find.text('Try again'), findsOneWidget);
    });
  }

  test('primary color pair meets WCAG AA contrast', () {
    final theme = buildAppTheme();
    final ratio = contrastRatio(
      theme.colorScheme.primary,
      theme.colorScheme.onPrimary,
    );

    expect(ratio, greaterThanOrEqualTo(4.5));
  });
}

double contrastRatio(Color first, Color second) {
  final lighter = first.computeLuminance() > second.computeLuminance()
      ? first.computeLuminance()
      : second.computeLuminance();
  final darker = first.computeLuminance() > second.computeLuminance()
      ? second.computeLuminance()
      : first.computeLuminance();
  return (lighter + 0.05) / (darker + 0.05);
}
