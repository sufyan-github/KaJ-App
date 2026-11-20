import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../../core/errors/error_mapper.dart';
import '../../../../core/errors/failure_copy.dart';
import '../../../../core/formatting/latin_digits_formatter.dart';
import '../../../../core/localization/kaaj_localizations.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/k_error_state.dart';
import '../../../../core/widgets/k_localized_text.dart';
import '../../../../core/widgets/k_network_image.dart';
import '../../../../core/widgets/k_primary_button.dart';
import '../../../../core/widgets/k_text_field.dart';
import '../../../catalog/presentation/widgets/area_picker.dart';
import '../../../trust_safety/presentation/trust_safety_providers.dart';
import '../../domain/my_profile.dart';
import '../controllers/my_profile_provider.dart';
import '../widgets/profile_completeness_card.dart';

/// Profile genders the API accepts, with their Bangla labels.
const _genders = {
  'FEMALE': 'নারী',
  'MALE': 'পুরুষ',
  'NON_BINARY': 'নন-বাইনারি',
  'PREFER_NOT_TO_SAY': 'বলতে চাই না',
};

typedef ProfilePhotoPicker = Future<Uint8List?> Function();

Future<Uint8List?> _pickFromGallery() async {
  final picked = await ImagePicker().pickImage(
    source: ImageSource.gallery,
    imageQuality: 92,
    maxWidth: 2400,
  );
  return picked?.readAsBytes();
}

class EditProfileScreen extends ConsumerWidget {
  const EditProfileScreen({this.pickPhoto = _pickFromGallery, super.key});

  final ProfilePhotoPicker pickPhoto;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(myProfileProvider);
    return Scaffold(
      appBar: AppBar(title: const KLocalizedText('প্রোফাইল সম্পাদনা')),
      body: profile.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(
          child: KErrorState(
            failure: ErrorMapper.from(error),
            retryLabel: 'আবার চেষ্টা করুন',
            onRetry: () => ref.invalidate(myProfileProvider),
          ),
        ),
        data: (value) => _EditProfileForm(profile: value, pickPhoto: pickPhoto),
      ),
    );
  }
}

class _EditProfileForm extends ConsumerStatefulWidget {
  const _EditProfileForm({required this.profile, required this.pickPhoto});

  final ProfilePhotoPicker pickPhoto;
  final MyProfile profile;

  @override
  ConsumerState<_EditProfileForm> createState() => _EditProfileFormState();
}

class _EditProfileFormState extends ConsumerState<_EditProfileForm> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _name;
  late final TextEditingController _bio;
  late final TextEditingController _birthYear;
  String? _gender;
  String? _locationId;
  bool _saving = false;
  bool _uploading = false;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController(text: widget.profile.displayName);
    _bio = TextEditingController(text: widget.profile.bio);
    _birthYear = TextEditingController(
      text: widget.profile.birthYear?.toString() ?? '',
    );
    _gender = _genders.containsKey(widget.profile.gender)
        ? widget.profile.gender
        : null;
    _locationId = widget.profile.primaryLocation?.id;
    _locationName = widget.profile.primaryLocation;
  }

  /// The names of the chosen area, for showing it in either language.
  ProfileArea? _locationName;

  Future<void> _pickArea() async {
    final place = await showAreaPickerSheet(context, selectedId: _locationId);
    if (place == null || !mounted) return;
    setState(() {
      _locationId = place.id;
      _locationName = ProfileArea(
        id: place.id,
        nameEn: place.nameEn,
        nameBn: place.nameBn,
      );
    });
  }

  @override
  void dispose() {
    _name.dispose();
    _bio.dispose();
    _birthYear.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _saving = true);
    final birthYear = int.tryParse(latinDigits(_birthYear.text.trim()));
    try {
      await ref
          .read(myProfileRepositoryProvider)
          .update(
            displayName: _name.text,
            bio: _bio.text,
            primaryLocationId: _locationId,
            // Only changed values are sent; the API keeps the others.
            gender: _gender == widget.profile.gender ? null : _gender,
            birthYear: birthYear == widget.profile.birthYear ? null : birthYear,
          );
      ref.invalidate(myProfileProvider);
      if (mounted) _snack('প্রোফাইল সংরক্ষণ হয়েছে।');
    } on Object catch (error) {
      if (mounted) {
        showFailureSnack(
          context,
          error,
          'সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।',
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _changePhoto() async {
    final Uint8List? bytes;
    try {
      bytes = await widget.pickPhoto();
    } on Object {
      if (mounted) _snack('ছবি বেছে নেওয়া যায়নি।');
      return;
    }
    if (bytes == null || !mounted) return;
    setState(() => _uploading = true);
    try {
      await ref.read(trustSafetyRepositoryProvider).uploadProfilePhoto(bytes);
      ref.invalidate(myProfileProvider);
      if (mounted) _snack('প্রোফাইল ছবি আপডেট হয়েছে।');
    } on Object catch (error) {
      if (mounted) {
        showFailureSnack(
          context,
          error,
          'ছবি আপলোড করা যায়নি। আবার চেষ্টা করুন।',
        );
      }
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  void _snack(String message) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: KLocalizedText(message)));

  @override
  Widget build(BuildContext context) {
    final language = Localizations.localeOf(context).languageCode;
    final photoUrl = widget.profile.photoUrl;
    return Form(
      key: _formKey,
      child: ListView(
        padding: const EdgeInsets.all(KSpacing.md),
        children: [
          const ProfileCompletenessCard(),
          const SizedBox(height: KSpacing.sm),
          Center(
            child: CircleAvatar(
              radius: 48,
              backgroundColor: KColors.surfaceAlt,
              child: photoUrl == null
                  ? const Icon(Icons.person_outline, size: 44)
                  : ClipOval(
                      child: KNetworkImage(
                        url: photoUrl,
                        width: 96,
                        height: 96,
                        semanticLabel: KaajLocalizations.text(
                          context,
                          'প্রোফাইল ছবি',
                        ),
                      ),
                    ),
            ),
          ),
          Center(
            child: TextButton.icon(
              key: const ValueKey('change-photo'),
              onPressed: _uploading ? null : _changePhoto,
              icon: _uploading
                  ? const SizedBox.square(
                      dimension: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.add_a_photo_outlined),
              label: const KLocalizedText('ছবি বদলান'),
            ),
          ),
          const SizedBox(height: KSpacing.md),
          KTextField(
            key: const ValueKey('profile-name'),
            label: 'নাম',
            controller: _name,
            textInputAction: TextInputAction.next,
            validator: (value) {
              final length = value?.trim().length ?? 0;
              return length < 2 || length > 80
                  ? 'নাম ২ থেকে ৮০ অক্ষরের মধ্যে লিখুন।'
                  : null;
            },
          ),
          const SizedBox(height: KSpacing.md),
          KTextField(
            key: const ValueKey('profile-bio'),
            label: 'নিজের সম্পর্কে',
            helperText: 'আপনার কাজ ও অভিজ্ঞতা ছোট করে লিখুন।',
            controller: _bio,
            maxLines: 4,
            minLines: 2,
            validator: (value) => (value?.trim().length ?? 0) > 500
                ? 'সর্বোচ্চ ৫০০ অক্ষর লেখা যাবে।'
                : null,
          ),
          const SizedBox(height: KSpacing.md),
          // City → thana → area, so the area can be more precise than
          // the city.
          Card(
            margin: EdgeInsets.zero,
            child: ListTile(
              key: const ValueKey('profile-area'),
              leading: const Icon(Icons.location_on_outlined),
              title: const KLocalizedText('এলাকা'),
              subtitle: _locationName == null
                  ? const KLocalizedText('এখনো বেছে নেওয়া হয়নি')
                  : Text(_locationName!.nameFor(language)),
              trailing: const KLocalizedText('বদলান'),
              onTap: _saving ? null : _pickArea,
            ),
          ),
          const SizedBox(height: KSpacing.md),
          DropdownButtonFormField<String>(
            key: const ValueKey('profile-gender'),
            initialValue: _gender,
            decoration: InputDecoration(
              labelText: KaajLocalizations.text(context, 'লিঙ্গ (ঐচ্ছিক)'),
              helperText: KaajLocalizations.text(
                context,
                'শুধু নারীদের দল ও সেশনে যোগ দিতে নারী বেছে নিতে হয়।',
              ),
              helperMaxLines: 2,
            ),
            items: [
              for (final entry in _genders.entries)
                DropdownMenuItem(
                  value: entry.key,
                  child: KLocalizedText(entry.value),
                ),
            ],
            onChanged: _saving
                ? null
                : (value) => setState(() => _gender = value),
          ),
          const SizedBox(height: KSpacing.md),
          KTextField(
            key: const ValueKey('profile-birth-year'),
            label: 'জন্ম সাল (ঐচ্ছিক)',
            controller: _birthYear,
            keyboardType: TextInputType.number,
            validator: (value) {
              final text = latinDigits(value?.trim() ?? '');
              if (text.isEmpty) return null;
              final year = int.tryParse(text);
              return year == null || year < 1900 || year > DateTime.now().year
                  ? 'সঠিক জন্ম সাল লিখুন, যেমন ১৯৯৫।'
                  : null;
            },
          ),
          const SizedBox(height: KSpacing.lg),
          KPrimaryButton(
            label: 'সংরক্ষণ করুন',
            isLoading: _saving,
            onPressed: _save,
          ),
        ],
      ),
    );
  }
}
