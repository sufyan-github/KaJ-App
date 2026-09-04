import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/theme/app_theme.dart';
import 'package:kaaj/features/trust_safety/domain/trust_models.dart';
import 'package:kaaj/features/trust_safety/presentation/attendance_screen.dart';
import 'package:kaaj/features/trust_safety/presentation/safety_screens.dart';
import 'package:kaaj/features/trust_safety/presentation/trust_safety_providers.dart';

void main() {
  testWidgets('report form remains usable at 200% text on a narrow phone', (
    tester,
  ) async {
    await _phone(
      tester,
      const ReportScreen(targetType: 'USER', targetId: 'user-1'),
    );

    expect(find.text('নিরাপত্তা রিপোর্ট'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('রিপোর্ট জমা দিন'),
      300,
      scrollable: find.byType(Scrollable).last,
    );
    expect(find.text('রিপোর্ট জমা দিন'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('portfolio renders its actionable empty state', (tester) async {
    await tester.binding.setSurfaceSize(const Size(360, 760));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      ProviderScope(
        overrides: [portfolioProvider.overrideWith((ref) async => const [])],
        child: MaterialApp(
          theme: buildAppTheme(),
          home: const PortfolioScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('আপনার কাজ দেখান — বেশি কাজ পান'), findsOneWidget);
    expect(find.text('কাজ যোগ করুন'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('attendance requires consent before enabling check-in', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(360, 760));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          attendanceProvider.overrideWith(
            (ref, id) async => const AttendanceState(
              geofenceRadiusM: 300,
              maxAccuracyM: 100,
              consentVersion: 'location-checkin-v1',
            ),
          ),
        ],
        child: MaterialApp(
          theme: buildAppTheme(),
          home: const AttendanceScreen(
            assignmentId: 'assignment-1',
            title: 'বাড়ির বৈদ্যুতিক কাজ',
            isPoster: false,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final button = tester.widget<ElevatedButton>(
      find.widgetWithText(ElevatedButton, 'লোকেশন নিয়ে চেক-ইন করুন'),
    );
    expect(button.onPressed, isNull);
    await tester.tap(find.byType(Checkbox));
    await tester.pump();
    final enabled = tester.widget<ElevatedButton>(
      find.widgetWithText(ElevatedButton, 'লোকেশন নিয়ে চেক-ইন করুন'),
    );
    expect(enabled.onPressed, isNotNull);
  });
}

Future<void> _phone(WidgetTester tester, Widget home) async {
  await tester.binding.setSurfaceSize(const Size(360, 760));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  await tester.pumpWidget(
    ProviderScope(
      child: MaterialApp(
        theme: buildAppTheme(),
        home: MediaQuery(
          data: const MediaQueryData(
            size: Size(360, 760),
            textScaler: TextScaler.linear(2),
          ),
          child: home,
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}
