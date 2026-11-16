import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/error_mapper.dart';
import '../../../core/errors/failure_copy.dart';
import '../../../core/formatting/kaaj_format.dart';
import '../../../core/formatting/latin_digits_formatter.dart';
import '../../../core/localization/kaaj_localizations.dart';
import '../../../core/routing/app_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_error_state.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../../../core/widgets/k_primary_button.dart';
import '../../../core/widgets/k_text_field.dart';
import '../../catalog/domain/entities/catalog_skill.dart';
import '../../catalog/presentation/controllers/catalog_providers.dart';
import '../../learning/presentation/publish_learning_screen.dart';
import '../../profile/presentation/controllers/me_provider.dart';
import '../domain/mentor_models.dart';
import 'mentor_providers.dart';

/// "Become a mentor": apply with the skills you can teach, see the review
/// state, and once approved open or close yourself to learners.
class MentorScreen extends ConsumerWidget {
  const MentorScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mentor = ref.watch(mentorProfileProvider);
    return Scaffold(
      appBar: AppBar(title: const KLocalizedText('মেন্টর')),
      body: mentor.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(
          child: KErrorState(
            failure: ErrorMapper.from(error),
            retryLabel: 'আবার চেষ্টা করুন',
            onRetry: () => ref.invalidate(mentorProfileProvider),
          ),
        ),
        data: (profile) => RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(mentorProfileProvider);
            await ref
                .read(mentorProfileProvider.future)
                .then<void>((_) {}, onError: (_) {});
          },
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(KSpacing.md),
            children: [
              switch (profile.status) {
                MentorStatus.pending => const _StatusCard(
                  key: ValueKey('mentor-pending'),
                  icon: Icons.hourglass_top,
                  title: 'আবেদন পর্যালোচনায় আছে',
                  body:
                      'KAAJ আপনার দক্ষতা যাচাই করছে। সিদ্ধান্ত হলে নোটিফিকেশন পাবেন।',
                ),
                MentorStatus.approved => _ApprovedPanel(profile: profile),
                MentorStatus.suspended => const _StatusCard(
                  key: ValueKey('mentor-suspended'),
                  icon: Icons.block,
                  color: KColors.danger,
                  title: 'মেন্টর প্রোফাইল স্থগিত',
                  body:
                      'এখন শেখার সুযোগ প্রকাশ বা শিক্ষার্থী নেওয়া যাবে না। বিস্তারিত জানতে সহায়তা কেন্দ্রে যোগাযোগ করুন।',
                ),
                MentorStatus.none ||
                MentorStatus.rejected => _ApplicationForm(profile: profile),
              },
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({
    required this.icon,
    required this.title,
    required this.body,
    this.color = KColors.primary,
    super.key,
  });

  final IconData icon;
  final String title;
  final String body;
  final Color color;

  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: true,
    child: Card(
      child: ListTile(
        leading: Icon(icon, color: color),
        title: KLocalizedText(title),
        subtitle: KLocalizedText(body),
      ),
    ),
  );
}

class _ApprovedPanel extends ConsumerStatefulWidget {
  const _ApprovedPanel({required this.profile});

  final MentorProfile profile;

  @override
  ConsumerState<_ApprovedPanel> createState() => _ApprovedPanelState();
}

class _ApprovedPanelState extends ConsumerState<_ApprovedPanel> {
  bool? _accepting;
  bool _saving = false;

  Future<void> _toggle(bool value) async {
    final previous = _accepting ?? widget.profile.accepting;
    setState(() {
      _accepting = value;
      _saving = true;
    });
    try {
      final saved = await ref
          .read(mentorRepositoryProvider)
          .setAccepting(value);
      if (mounted) setState(() => _accepting = saved.accepting);
    } on Object catch (error) {
      if (!mounted) return;
      setState(() => _accepting = previous);
      showFailureSnack(context, error, 'পরিবর্তন সংরক্ষণ করা যায়নি।');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final language = Localizations.localeOf(context).languageCode;
    final accepting = _accepting ?? widget.profile.accepting;
    return Column(
      key: const ValueKey('mentor-approved'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _StatusCard(
          icon: Icons.verified,
          color: KColors.success,
          title: 'আপনি KAAJ মেন্টর',
          body: 'আপনার যাচাই করা দক্ষতায় শেখার সুযোগ প্রকাশ করতে পারবেন।',
        ),
        if (widget.profile.skills.isNotEmpty) ...[
          const SizedBox(height: KSpacing.sm),
          Wrap(
            spacing: KSpacing.sm,
            children: [
              for (final skill in widget.profile.skills)
                Chip(label: Text(skill.nameFor(language))),
            ],
          ),
        ],
        const SizedBox(height: KSpacing.sm),
        const SizedBox(height: KSpacing.md),
        const MyLearningOpportunities(),
        const SizedBox(height: KSpacing.md),
        SwitchListTile(
          key: const ValueKey('mentor-accepting'),
          title: const KLocalizedText('নতুন শিক্ষার্থী নিচ্ছি'),
          subtitle: const KLocalizedText(
            'বন্ধ করলে আপনার শেখার সুযোগে নতুন আবেদন আসবে না।',
          ),
          value: accepting,
          onChanged: _saving ? null : _toggle,
        ),
      ],
    );
  }
}

class _ApplicationForm extends ConsumerStatefulWidget {
  const _ApplicationForm({required this.profile});

  final MentorProfile profile;

  @override
  ConsumerState<_ApplicationForm> createState() => _ApplicationFormState();
}

class _ApplicationFormState extends ConsumerState<_ApplicationForm> {
  static const _maxSkills = 5;

  late final _bio = TextEditingController(text: widget.profile.bio);
  late final _years = TextEditingController(
    text: widget.profile.yearsExperience?.toString() ?? '',
  );
  late final Set<String> _skills = {
    for (final skill in widget.profile.skills) skill.skillId,
  };
  final _formKey = GlobalKey<FormState>();
  final _evidence = <Uint8List>[];
  bool _saving = false;
  String _query = '';
  String? _error;
  bool _needsIdentity = false;

  @override
  void dispose() {
    _bio.dispose();
    _years.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_skills.isEmpty) {
      setState(
        () => _error = KaajLocalizations.text(
          context,
          'অন্তত একটি দক্ষতা বেছে নিন যা শেখাতে পারবেন।',
        ),
      );
      return;
    }
    if (_evidence.isEmpty) {
      setState(
        () => _error = KaajLocalizations.text(
          context,
          'দক্ষতার প্রমাণ হিসেবে অন্তত একটি ছবি দিন।',
        ),
      );
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
      _needsIdentity = false;
    });
    try {
      final upload = ref.read(mentorEvidenceUploaderProvider);
      final documentIds = <String>[];
      for (final photo in _evidence) {
        documentIds.add(await upload(photo));
      }
      await ref
          .read(mentorRepositoryProvider)
          .apply(
            skillIds: _skills.toList(growable: false),
            bio: _bio.text,
            yearsExperience: int.tryParse(latinDigits(_years.text.trim())),
            documentIds: documentIds,
          );
      ref.invalidate(mentorProfileProvider);
      refreshMe(ref);
    } on Object catch (error) {
      if (!mounted) return;
      setState(() {
        _needsIdentity = ErrorMapper.from(error).code == 'IDENTITY_REQUIRED';
        _error = failureText(
          context,
          error,
          'আবেদন পাঠানো যায়নি। আবার চেষ্টা করুন।',
        );
      });
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final language = Localizations.localeOf(context).languageCode;
    final mySkillIds = {
      ...?ref
          .watch(meProvider)
          .valueOrNull
          ?.skills
          .map((skill) => skill.skillId),
    };
    final catalog = ref.watch(catalogSkillsProvider);
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (widget.profile.status == MentorStatus.rejected)
            _StatusCard(
              key: const ValueKey('mentor-rejected'),
              icon: Icons.info_outline,
              color: KColors.warning,
              title: 'আগের আবেদন গ্রহণ করা হয়নি',
              body:
                  widget.profile.rejectionReason ??
                  'প্রয়োজনীয় তথ্য যোগ করে আবার আবেদন করতে পারেন।',
            ),
          KLocalizedText(
            'মেন্টর হোন',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: KSpacing.xs),
          const KLocalizedText(
            'আপনি যে কাজে দক্ষ, তা অন্যদের শেখান: প্রশিক্ষণ বা শিক্ষানবিশি দিন। KAAJ আপনার পরিচয় ও দক্ষতা যাচাই করে অনুমোদন দেবে।',
            style: TextStyle(color: KColors.textSecondary),
          ),
          const SizedBox(height: KSpacing.md),
          KLocalizedText(
            'যে দক্ষতা শেখাতে পারবেন (সর্বোচ্চ ৫টি)',
            style: Theme.of(context).textTheme.titleSmall,
          ),
          const SizedBox(height: KSpacing.xs),
          TextField(
            decoration: InputDecoration(
              hintText: KaajLocalizations.text(context, 'দক্ষতা খুঁজুন'),
              prefixIcon: const Icon(Icons.search),
            ),
            onChanged: (value) => setState(() => _query = value.trim()),
          ),
          const SizedBox(height: KSpacing.sm),
          catalog.when(
            loading: () => const LinearProgressIndicator(),
            error: (error, _) => Text(
              failureText(context, error, 'দক্ষতার তালিকা লোড করা যায়নি।'),
            ),
            data: (skills) {
              // Skills already on the profile first, then the rest.
              final ordered = [...skills]
                ..sort((a, b) {
                  final mine =
                      (mySkillIds.contains(b.id) ? 1 : 0) -
                      (mySkillIds.contains(a.id) ? 1 : 0);
                  return mine != 0
                      ? mine
                      : a.nameFor(language).compareTo(b.nameFor(language));
                });
              final visible = ordered
                  .where((skill) => _matches(skill))
                  .take(24)
                  .toList(growable: false);
              return Wrap(
                spacing: KSpacing.sm,
                runSpacing: KSpacing.xs,
                children: [
                  for (final skill in visible)
                    FilterChip(
                      key: ValueKey('mentor-skill-${skill.id}'),
                      label: Text(skill.nameFor(language)),
                      selected: _skills.contains(skill.id),
                      onSelected:
                          !_skills.contains(skill.id) &&
                              _skills.length >= _maxSkills
                          ? null
                          : (selected) => setState(
                              () => selected
                                  ? _skills.add(skill.id)
                                  : _skills.remove(skill.id),
                            ),
                    ),
                ],
              );
            },
          ),
          const SizedBox(height: KSpacing.md),
          KTextField(
            label: 'অভিজ্ঞতা (বছর)',
            controller: _years,
            keyboardType: TextInputType.number,
            validator: (value) {
              final text = value?.trim() ?? '';
              if (text.isEmpty) return null;
              final years = int.tryParse(latinDigits(text));
              return years == null || years < 0 || years > 60
                  ? 'সঠিক বছর লিখুন।'
                  : null;
            },
          ),
          const SizedBox(height: KSpacing.sm),
          KTextField(
            label: 'কীভাবে শেখাবেন, সংক্ষেপে',
            controller: _bio,
            maxLines: 4,
            minLines: 3,
            validator: (value) => (value?.trim().length ?? 0) < 20
                ? 'কমপক্ষে ২০ অক্ষরে লিখুন।'
                : null,
          ),
          const SizedBox(height: KSpacing.md),
          KLocalizedText(
            'দক্ষতার প্রমাণ (১–৫টি ছবি)',
            style: Theme.of(context).textTheme.titleSmall,
          ),
          const KLocalizedText(
            'সার্টিফিকেট, প্রশিক্ষণের কাগজ বা আপনার কাজের ছবি। শুধু KAAJ-এর যাচাইকারী দেখবেন।',
            style: TextStyle(color: KColors.textSecondary),
          ),
          const SizedBox(height: KSpacing.xs),
          Wrap(
            spacing: KSpacing.sm,
            runSpacing: KSpacing.sm,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              for (final (index, photo) in _evidence.indexed)
                InputChip(
                  avatar: CircleAvatar(backgroundImage: MemoryImage(photo)),
                  label: Text(KFormat.count(context, index + 1)),
                  onDeleted: _saving
                      ? null
                      : () => setState(() => _evidence.removeAt(index)),
                ),
              if (_evidence.length < 5)
                OutlinedButton.icon(
                  key: const ValueKey('mentor-add-evidence'),
                  onPressed: _saving ? null : _addEvidence,
                  icon: const Icon(Icons.add_photo_alternate_outlined),
                  label: const KLocalizedText('ছবি যোগ করুন'),
                ),
            ],
          ),
          const SizedBox(height: KSpacing.md),
          if (_error case final error?) ...[
            Semantics(
              liveRegion: true,
              child: Text(error, style: const TextStyle(color: KColors.danger)),
            ),
            if (_needsIdentity)
              TextButton.icon(
                key: const ValueKey('mentor-verify-identity'),
                onPressed: () =>
                    context.push(AppRoutes.verificationCapture('IDENTITY')),
                icon: const Icon(Icons.badge_outlined),
                label: const KLocalizedText('পরিচয় যাচাই করুন'),
              ),
            const SizedBox(height: KSpacing.sm),
          ],
          KPrimaryButton(
            label: 'আবেদন পাঠান',
            isLoading: _saving,
            onPressed: _submit,
          ),
        ],
      ),
    );
  }

  Future<void> _addEvidence() async {
    try {
      final photo = await ref.read(mentorEvidencePickerProvider)();
      if (photo != null && mounted) setState(() => _evidence.add(photo));
    } on Object {
      if (mounted) {
        setState(
          () => _error = KaajLocalizations.text(
            context,
            'ছবি বেছে নেওয়া যায়নি।',
          ),
        );
      }
    }
  }

  bool _matches(CatalogSkill skill) {
    if (_query.isEmpty) return true;
    final needle = _query.toLowerCase();
    return skill.nameBn.contains(_query) ||
        skill.nameEn.toLowerCase().contains(needle) ||
        _skills.contains(skill.id);
  }
}
