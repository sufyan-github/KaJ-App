import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/failure_copy.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../domain/settings_models.dart';
import 'settings_providers.dart';

/// Real privacy controls: photo, full name, precise area, who can message
/// and whether the profile is listed.
///
/// Each change is saved at once. Against a server without privacy controls
/// this shows nothing, so the screen keeps its explanations only.
class PrivacyControls extends ConsumerStatefulWidget {
  const PrivacyControls({super.key});

  @override
  ConsumerState<PrivacyControls> createState() => _PrivacyControlsState();
}

class _PrivacyControlsState extends ConsumerState<PrivacyControls> {
  PrivacySettings? _local;
  bool _saving = false;

  Future<void> _save(
    PrivacySettings current,
    PrivacySettings next,
    Map<String, Object> changes,
  ) async {
    setState(() {
      _local = next;
      _saving = true;
    });
    try {
      final stored = await ref
          .read(settingsRepositoryProvider)
          .updatePrivacy(changes);
      if (mounted) setState(() => _local = stored);
      ref.invalidate(privacySettingsProvider);
    } on Object catch (error) {
      if (!mounted) return;
      setState(() => _local = current);
      showFailureSnack(
        context,
        error,
        'গোপনীয়তার পছন্দ সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।',
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final remote = ref.watch(privacySettingsProvider);
    return remote.when(
      loading: () => const Padding(
        padding: EdgeInsets.all(KSpacing.lg),
        child: Center(child: CircularProgressIndicator()),
      ),
      error: (error, _) => Card(
        child: ListTile(
          leading: const Icon(Icons.info_outline),
          title: Text(
            failureText(context, error, 'গোপনীয়তার পছন্দ লোড করা যায়নি।'),
          ),
          trailing: TextButton(
            onPressed: () => ref.invalidate(privacySettingsProvider),
            child: const KLocalizedText('আবার চেষ্টা করুন'),
          ),
        ),
      ),
      data: (value) {
        if (value == null) return const SizedBox.shrink();
        final settings = _local ?? value;
        final theme = Theme.of(context);
        void update(PrivacySettings next, String key, Object wire) =>
            _saving ? null : _save(settings, next, {key: wire});
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            KLocalizedText(
              'আপনার গোপনীয়তার পছন্দ',
              style: theme.textTheme.titleMedium,
            ),
            const SizedBox(height: KSpacing.sm),
            Card(
              margin: EdgeInsets.zero,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: KSpacing.sm),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _Heading('প্রোফাইল ছবি কে দেখবেন'),
                    Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: KSpacing.md,
                      ),
                      child: SegmentedButton<PhotoVisibility>(
                        showSelectedIcon: false,
                        segments: const [
                          ButtonSegment(
                            value: PhotoVisibility.everyone,
                            label: KLocalizedText('সবাই'),
                          ),
                          ButtonSegment(
                            value: PhotoVisibility.afterHire,
                            label: KLocalizedText('কাজ নিশ্চিত হলে'),
                          ),
                          ButtonSegment(
                            value: PhotoVisibility.nobody,
                            label: KLocalizedText('কেউ না'),
                          ),
                        ],
                        selected: {settings.photoVisibility},
                        onSelectionChanged: _saving
                            ? null
                            : (selection) => update(
                                settings.copyWith(
                                  photoVisibility: selection.first,
                                ),
                                'photoVisibility',
                                selection.first.wire,
                              ),
                      ),
                    ),
                    const SizedBox(height: KSpacing.sm),
                    SwitchListTile(
                      title: const KLocalizedText('পুরো নাম দেখান'),
                      subtitle: const KLocalizedText(
                        'বন্ধ থাকলে কাজ নিশ্চিত হওয়ার আগে নাম ছোট করে দেখানো হয়, যেমন "রহিমা খ."।',
                      ),
                      value: settings.showFullName,
                      onChanged: _saving
                          ? null
                          : (value) => update(
                              settings.copyWith(showFullName: value),
                              'showFullName',
                              value,
                            ),
                    ),
                    SwitchListTile(
                      title: const KLocalizedText('সঠিক অবস্থান লুকান'),
                      subtitle: const KLocalizedText(
                        'শুধু এলাকার নাম দেখানো হবে, মানচিত্রে বিন্দু নয়।',
                      ),
                      value: settings.hidePreciseArea,
                      onChanged: _saving
                          ? null
                          : (value) => update(
                              settings.copyWith(hidePreciseArea: value),
                              'hidePreciseArea',
                              value,
                            ),
                    ),
                    SwitchListTile(
                      title: const KLocalizedText('কর্মী তালিকায় আমাকে দেখান'),
                      subtitle: const KLocalizedText(
                        'বন্ধ থাকলে কর্মী তালিকা ও পরামর্শে আপনাকে দেখানো হবে না।',
                      ),
                      value: settings.discoverable,
                      onChanged: _saving
                          ? null
                          : (value) => update(
                              settings.copyWith(discoverable: value),
                              'discoverable',
                              value,
                            ),
                    ),
                    const Divider(),
                    _Heading('কে আপনাকে বার্তা দিতে পারবেন'),
                    RadioGroup<MessagePermission>(
                      groupValue: settings.allowMessagesFrom,
                      onChanged: (value) {
                        if (value == null || _saving) return;
                        update(
                          settings.copyWith(allowMessagesFrom: value),
                          'allowMessagesFrom',
                          value.wire,
                        );
                      },
                      child: const Column(
                        children: [
                          RadioListTile<MessagePermission>(
                            value: MessagePermission.anyone,
                            title: KLocalizedText(
                              'কাজের পোস্ট ও আবেদনের মাধ্যমে যে কেউ',
                            ),
                          ),
                          RadioListTile<MessagePermission>(
                            value: MessagePermission.engagedOnly,
                            title: KLocalizedText('শুধু কাজ নিশ্চিত হওয়ার পর'),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _Heading extends StatelessWidget {
  const _Heading(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(
      KSpacing.md,
      KSpacing.sm,
      KSpacing.md,
      KSpacing.sm,
    ),
    child: KLocalizedText(text, style: Theme.of(context).textTheme.labelLarge),
  );
}
