import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/theme/app_theme.dart';
import 'package:kaaj/core/widgets/k_primary_button.dart';
import 'package:kaaj/features/trust_safety/domain/trust_models.dart';
import 'package:kaaj/features/trust_safety/presentation/attendance_screen.dart';
import 'package:kaaj/features/trust_safety/presentation/safety_screens.dart';
import 'package:kaaj/features/trust_safety/presentation/trust_safety_providers.dart';
import 'package:kaaj/features/trust_safety/presentation/verification_screens.dart';

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

    expect(find.text('আপনার কাজ দেখান — বেশি কাজ পাবেন'), findsOneWidget);
    expect(find.text('০ / ২০টি কাজের নমুনা'), findsOneWidget);
    expect(find.text('প্রথম কাজটি যোগ করুন'), findsOneWidget);
    expect(find.text('কাজ যোগ করুন'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('portfolio grid remains usable at 200% text', (tester) async {
    await tester.binding.setSurfaceSize(const Size(360, 760));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          portfolioProvider.overrideWith(
            (ref) async => [
              PortfolioItem(
                id: 'portfolio-1',
                imageUrl: 'https://example.invalid/work.jpg',
                categoryId: 'category-1',
                categoryName: 'বৈদ্যুতিক কাজ',
                caption: 'সিলিং ফ্যান নিরাপদে মেরামত করেছি',
                sortOrder: 0,
                createdAt: DateTime.utc(2026, 9, 5),
              ),
            ],
          ),
        ],
        child: MaterialApp(
          theme: buildAppTheme(),
          home: const MediaQuery(
            data: MediaQueryData(
              size: Size(360, 760),
              textScaler: TextScaler.linear(2),
            ),
            child: PortfolioScreen(),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('১ / ২০টি কাজের নমুনা'), findsOneWidget);
    expect(find.text('বৈদ্যুতিক কাজ'), findsOneWidget);
    expect(
      tester.widget<Text>(find.text('বৈদ্যুতিক কাজ')).textAlign,
      TextAlign.center,
    );
    expect(
      tester
          .widget<Text>(find.text('সিলিং ফ্যান নিরাপদে মেরামত করেছি'))
          .textAlign,
      TextAlign.center,
    );
    expect(find.byTooltip('কাজের নমুনার অপশন'), findsOneWidget);
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

  testWidgets('identity verification requires separate NID and selfie images', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(360, 760));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: buildAppTheme(),
          home: const VerificationCaptureScreen(kind: 'IDENTITY'),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('NID-এর সামনের দিক'), findsOneWidget);
    expect(find.text('আপনার সেলফি'), findsOneWidget);
    expect(find.text('ছবি তুলুন'), findsNWidgets(2));
    await tester.drag(find.byType(ListView), const Offset(0, -500));
    await tester.pumpAndSettle();
    final submit = tester.widget<KPrimaryButton>(find.byType(KPrimaryButton));
    expect(submit.onPressed, isNull);
    expect(tester.takeException(), isNull);
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
