import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/widgets/k_primary_button.dart';
import 'package:kaaj/core/widgets/k_text_field.dart';
import 'package:kaaj/features/catalog/domain/entities/catalog_category.dart';
import 'package:kaaj/features/catalog/presentation/controllers/catalog_providers.dart';
import 'package:kaaj/features/jobs/presentation/screens/jobs_screens.dart';
import 'package:kaaj/features/onboarding/domain/onboarding_state.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';

void main() {
  testWidgets('a staff job carries the business id; a refusal is shown', (
    tester,
  ) async {
    final api = FakeApi()
      ..on('POST /jobs', FakeResponse.error(409, 'BUSINESS_SUSPENDED'));
    await pumpRouted(
      tester,
      api: api,
      home: const CreateJobScreen(businessProfileId: 'b-1'),
      size: const Size(400, 1600),
      overrides: [
        meAs(KaajRole.customer),
        categoryTreeProvider.overrideWith(
          (ref) async => const [
            CatalogCategory(
              id: 'farm',
              slug: 'farm',
              nameEn: 'Farm work',
              nameBn: 'খামারের কাজ',
              sortOrder: 1,
              icon: 'farm',
            ),
          ],
        ),
        catalogSkillsProvider.overrideWith((ref) async => []),
      ],
    );
    expect(find.text('Post a staff job'), findsOneWidget);
    final fields = tester
        .widgetList<KTextField>(find.byType(KTextField))
        .toList();
    fields[0].controller!.text = 'Packing helper';
    fields[1].controller!.text = 'Pack vegetables in the morning for delivery.';
    fields[2].controller!.text = '500';
    tester
        .state<FormFieldState<String>>(
          find.byType(DropdownButtonFormField<String>).first,
        )
        .didChange('farm');
    tester.widget<KPrimaryButton>(find.byType(KPrimaryButton)).onPressed!();
    await tester.pumpAndSettle();

    final body = api.called('POST /jobs').single.data! as Map;
    expect(body['businessProfileId'], 'b-1');
    expect(
      find.text('This business is suspended by KAAJ moderation.'),
      findsOneWidget,
    );
  });
}
