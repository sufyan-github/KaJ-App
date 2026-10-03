import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/failure.dart';
import '../../../core/localization/kaaj_localizations.dart';
import '../../../core/localization/locale_controller.dart';
import '../../../core/permissions/permission_gateway.dart';
import '../../../core/routing/app_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../../auth/presentation/controllers/auth_controller.dart';
import '../../auth/presentation/controllers/auth_providers.dart';
import '../../onboarding/domain/onboarding_state.dart';
import '../../onboarding/presentation/controllers/onboarding_controller.dart';
import '../domain/settings_models.dart';
import 'settings_providers.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  bool _switchingRole = false;

  @override
  Widget build(BuildContext context) {
    final onboarding = ref.watch(onboardingControllerProvider);
    final role = onboarding.role ?? KaajRole.customer;
    final auth = ref.watch(authControllerProvider);
    final locale = ref.watch(localeControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const KLocalizedText('সেটিংস')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
          KSpacing.md,
          KSpacing.sm,
          KSpacing.md,
          KSpacing.xxl,
        ),
        children: [
          _SettingsSection(
            title: 'অ্যাকাউন্ট',
            children: [
              _SettingsTile(
                icon: Icons.account_circle_outlined,
                title: 'ব্যক্তিগত তথ্য',
                subtitle: 'নাম, পরিচয় ও প্রোফাইলের তথ্য দেখুন',
                onTap: () => context.push(
                  role == KaajRole.worker
                      ? AppRoutes.publicWorkerProfile
                      : AppRoutes.accountSettings,
                ),
              ),
              _SettingsTile(
                icon: Icons.language_outlined,
                title: 'ভাষা',
                subtitle: locale.languageCode == 'en'
                    ? 'English — current language'
                    : 'বাংলা — বর্তমান ভাষা',
                onTap: _showLanguage,
              ),
              Card(
                margin: const EdgeInsets.only(bottom: KSpacing.sm),
                child: Padding(
                  padding: const EdgeInsets.all(KSpacing.md),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Icon(Icons.swap_horiz_outlined),
                          const SizedBox(width: KSpacing.md),
                          Expanded(
                            child: KLocalizedText(
                              'বর্তমান কাজের মোড',
                              style: Theme.of(context).textTheme.titleSmall,
                            ),
                          ),
                          if (_switchingRole)
                            const SizedBox.square(
                              dimension: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            ),
                        ],
                      ),
                      const SizedBox(height: KSpacing.sm),
                      SegmentedButton<KaajRole>(
                        segments: const [
                          ButtonSegment(
                            value: KaajRole.customer,
                            icon: Icon(Icons.work_outline),
                            label: KLocalizedText('কাজ দেব'),
                          ),
                          ButtonSegment(
                            value: KaajRole.worker,
                            icon: Icon(Icons.handyman_outlined),
                            label: KLocalizedText('কাজ করব'),
                          ),
                        ],
                        selected: {role},
                        onSelectionChanged: _switchingRole
                            ? null
                            : (selection) => _switchRole(selection.first),
                      ),
                      const SizedBox(height: KSpacing.xs),
                      const KLocalizedText(
                        'মোড বদলালে হোমের কাজ ও সুবিধা সঙ্গে সঙ্গে বদলে যাবে।',
                        style: TextStyle(color: KColors.textSecondary),
                      ),
                    ],
                  ),
                ),
              ),
              if (role == KaajRole.worker)
                _SettingsTile(
                  icon: Icons.photo_library_outlined,
                  title: 'কাজের পোর্টফোলিও',
                  subtitle: 'ছবি, ক্যাপশন ও প্রদর্শনের ক্রম ঠিক করুন',
                  onTap: () => context.push(AppRoutes.portfolio),
                ),
            ],
          ),
          const SizedBox(height: KSpacing.lg),
          _SettingsSection(
            title: 'পছন্দ',
            children: [
              _SettingsTile(
                icon: Icons.notifications_outlined,
                title: 'নোটিফিকেশন পছন্দ',
                subtitle: 'কোন ধরনের আপডেট পাবেন তা ঠিক করুন',
                onTap: () => context.push(AppRoutes.notificationSettings),
              ),
            ],
          ),
          const SizedBox(height: KSpacing.lg),
          _SettingsSection(
            title: 'সাবস্ক্রিপশন ও পেমেন্ট',
            children: [
              _SettingsTile(
                icon: Icons.workspace_premium_outlined,
                title: 'সাবস্ক্রিপশন',
                subtitle: 'প্ল্যান, অপারেটর যাচাই ও সুবিধার অবস্থা দেখুন',
                onTap: () => context.push(AppRoutes.subscription),
              ),
              _SettingsTile(
                icon: Icons.receipt_long_outlined,
                title: 'কাজের পেমেন্ট ইতিহাস',
                subtitle: 'নগদ পেমেন্টের অপেক্ষমাণ ও সম্পন্ন রেকর্ড দেখুন',
                onTap: () => context.push(AppRoutes.jobPayments),
              ),
            ],
          ),
          const SizedBox(height: KSpacing.lg),
          _SettingsSection(
            title: 'গোপনীয়তা ও নিরাপত্তা',
            children: [
              _SettingsTile(
                icon: Icons.password_outlined,
                title: 'পাসওয়ার্ড ও অ্যাকাউন্টে প্রবেশ',
                onTap: () => context.push(AppRoutes.passwordSetup),
              ),
              _SettingsTile(
                icon: Icons.privacy_tip_outlined,
                title: 'গোপনীয়তা ও অনুমতি',
                subtitle: 'কোন তথ্য কোথায় ব্যবহৃত হয় ও ফোনের অনুমতি দেখুন',
                onTap: () => context.push(AppRoutes.privacySettings),
              ),
              _SettingsTile(
                icon: Icons.verified_user_outlined,
                title: 'পরিচয় ও দক্ষতা যাচাই',
                onTap: () => context.push(AppRoutes.verification),
              ),
              _SettingsTile(
                icon: Icons.person_off_outlined,
                title: 'ব্লক করা ব্যবহারকারী',
                subtitle: 'ব্লক তালিকা দেখুন বা আনব্লক করুন',
                onTap: () => context.push(AppRoutes.blockedUsers),
              ),
              _SettingsTile(
                icon: Icons.manage_accounts_outlined,
                title: 'তথ্য ও অ্যাকাউন্ট',
                subtitle: 'ডিভাইস থেকে সাইন আউট বা অ্যাকাউন্ট মুছুন',
                onTap: () => context.push(AppRoutes.accountSettings),
              ),
            ],
          ),
          const SizedBox(height: KSpacing.lg),
          _SettingsSection(
            title: 'সহায়তা',
            children: [
              _SettingsTile(
                icon: Icons.health_and_safety_outlined,
                title: 'সহায়তা ও নিরাপত্তা',
                subtitle: 'জরুরি সহায়তা, নিরাপত্তা নির্দেশনা ও রিপোর্ট',
                onTap: () => context.push(AppRoutes.helpSafety),
              ),
              _SettingsTile(
                icon: Icons.gavel_outlined,
                title: 'বিরোধ ও সিদ্ধান্ত',
                subtitle: 'খোলা বিরোধ ও সিদ্ধান্ত অনুসরণ করুন',
                onTap: () => context.push(AppRoutes.disputes),
              ),
            ],
          ),
          const SizedBox(height: KSpacing.lg),
          _SettingsSection(
            title: 'সম্পর্কে',
            children: [
              _SettingsTile(
                icon: Icons.description_outlined,
                title: 'ব্যবহারের শর্ত',
                onTap: () => _showInfo(
                  'ব্যবহারের শর্ত',
                  'KAAJ ব্যবহার করে কাজ পোস্ট বা গ্রহণ করার সময় সত্য তথ্য দিন, প্ল্যাটফর্মের নিরাপত্তা নিয়ম মানুন এবং কাজের চুক্তি অনুসরণ করুন।',
                ),
              ),
              _SettingsTile(
                icon: Icons.policy_outlined,
                title: 'গোপনীয়তা নীতি',
                onTap: () => _showInfo(
                  'গোপনীয়তা নীতি',
                  'ফোন নম্বর, সঠিক ঠিকানা, NID, সেলফি ও নথি প্রকাশ করা হয় না। কাজ ও নিরাপত্তার প্রয়োজন অনুযায়ী সীমিত সময় তথ্য রাখা হয়।',
                ),
              ),
              const ListTile(
                leading: Icon(Icons.info_outline),
                title: KLocalizedText('অ্যাপ সংস্করণ'),
                subtitle: KLocalizedText('1.0.0 (ডেভেলপমেন্ট)'),
              ),
            ],
          ),
          const SizedBox(height: KSpacing.lg),
          OutlinedButton.icon(
            onPressed: auth.status == AuthStatus.loading
                ? null
                : _confirmLogout,
            icon: const Icon(Icons.logout),
            label: const KLocalizedText('এই ডিভাইস থেকে সাইন আউট'),
            style: OutlinedButton.styleFrom(
              foregroundColor: KColors.danger,
              side: const BorderSide(color: KColors.danger),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _switchRole(KaajRole role) async {
    final current = ref.read(onboardingControllerProvider).role;
    if (current == role) return;
    setState(() => _switchingRole = true);
    try {
      await ref.read(onboardingControllerProvider.notifier).selectRole(role);
      ref.invalidate(accountSummaryProvider);
      if (mounted) _snack('কাজের মোড পরিবর্তন হয়েছে।');
    } on Object catch (error) {
      if (mounted) _snack(_settingsMessage(error));
    } finally {
      if (mounted) setState(() => _switchingRole = false);
    }
  }

  Future<void> _confirmLogout() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const KLocalizedText('সাইন আউট করবেন?'),
        content: const KLocalizedText(
          'এই ফোনে আবার OTP দিয়ে প্রবেশ করতে হবে।',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const KLocalizedText('থাকুন'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const KLocalizedText('সাইন আউট'),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await ref.read(authControllerProvider.notifier).logout();
    }
  }

  void _showLanguage() {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) {
        final selected = ref.read(localeControllerProvider).languageCode;
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              KSpacing.md,
              0,
              KSpacing.md,
              KSpacing.lg,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const KLocalizedText(
                  'অ্যাপের ভাষা',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: KSpacing.md),
                ListTile(
                  selected: selected == 'bn',
                  leading: Icon(
                    selected == 'bn'
                        ? Icons.check_circle
                        : Icons.language_outlined,
                    color: selected == 'bn' ? KColors.primary : null,
                  ),
                  title: const KLocalizedText('বাংলা'),
                  subtitle: KLocalizedText(
                    selected == 'bn' ? 'বর্তমান ভাষা' : 'বাংলায় বদলান',
                  ),
                  onTap: () => _selectLanguage(sheetContext, 'bn'),
                ),
                ListTile(
                  selected: selected == 'en',
                  leading: Icon(
                    selected == 'en'
                        ? Icons.check_circle
                        : Icons.language_outlined,
                    color: selected == 'en' ? KColors.primary : null,
                  ),
                  title: const KLocalizedText('English'),
                  subtitle: KLocalizedText(
                    selected == 'en' ? 'Current language' : 'ইংরেজিতে বদলান',
                  ),
                  onTap: () => _selectLanguage(sheetContext, 'en'),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Future<void> _selectLanguage(
    BuildContext sheetContext,
    String languageCode,
  ) async {
    await ref
        .read(localeControllerProvider.notifier)
        .setLocale(Locale(languageCode));
    if (sheetContext.mounted) Navigator.pop(sheetContext);
  }

  void _showInfo(String title, String body) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            KSpacing.lg,
            0,
            KSpacing.lg,
            KSpacing.xl,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              KLocalizedText(
                title,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: KSpacing.md),
              KLocalizedText(body),
            ],
          ),
        ),
      ),
    );
  }

  void _snack(String message) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: KLocalizedText(message)));
}

class NotificationPreferencesScreen extends ConsumerStatefulWidget {
  const NotificationPreferencesScreen({
    this.permissionGateway = const PermissionGateway(),
    super.key,
  });

  final PermissionGateway permissionGateway;

  @override
  ConsumerState<NotificationPreferencesScreen> createState() =>
      _NotificationPreferencesScreenState();
}

class _NotificationPreferencesScreenState
    extends ConsumerState<NotificationPreferencesScreen>
    with WidgetsBindingObserver {
  late Future<KPermissionStatus> _permissionStatus;
  final Map<String, bool> _overrides = {};
  final Set<String> _busyGroups = {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _permissionStatus = widget.permissionGateway.status(
      KPermission.notifications,
    );
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      setState(() {
        _permissionStatus = widget.permissionGateway.status(
          KPermission.notifications,
        );
      });
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final preferences = ref.watch(notificationPreferencesProvider);
    return Scaffold(
      appBar: AppBar(title: const KLocalizedText('নোটিফিকেশন পছন্দ')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(notificationPreferencesProvider.future),
        child: preferences.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(KSpacing.xl),
            children: [
              const SizedBox(height: KSpacing.xxl),
              const Icon(Icons.cloud_off_outlined, size: 48),
              const SizedBox(height: KSpacing.md),
              KLocalizedText(
                _settingsMessage(error),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: KSpacing.md),
              FilledButton.icon(
                onPressed: () =>
                    ref.invalidate(notificationPreferencesProvider),
                icon: const Icon(Icons.refresh),
                label: const KLocalizedText('আবার চেষ্টা করুন'),
              ),
            ],
          ),
          data: _buildPreferences,
        ),
      ),
    );
  }

  Widget _buildPreferences(List<NotificationPreference> preferences) {
    final saved = {
      for (final item in preferences)
        if (item.channel == 'IN_APP') item.type: item.isEnabled,
    };
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(
        KSpacing.md,
        KSpacing.sm,
        KSpacing.md,
        KSpacing.xl,
      ),
      children: [
        FutureBuilder<KPermissionStatus>(
          future: _permissionStatus,
          builder: (context, snapshot) {
            if (!snapshot.hasData ||
                snapshot.data == KPermissionStatus.granted) {
              return const SizedBox.shrink();
            }
            return Padding(
              padding: const EdgeInsets.only(bottom: KSpacing.md),
              child: Card(
                color: KColors.warning.withValues(alpha: .09),
                child: ListTile(
                  leading: const Icon(
                    Icons.notifications_off_outlined,
                    color: KColors.warning,
                  ),
                  title: const KLocalizedText('ফোনের নোটিফিকেশন বন্ধ আছে'),
                  subtitle: const KLocalizedText(
                    'ইনবক্স থাকবে, তবে ফোনের বাইরে নতুন আপডেট দেখবেন না।',
                  ),
                  trailing: TextButton(
                    onPressed: widget.permissionGateway.openSettings,
                    child: const KLocalizedText('সেটিংস'),
                  ),
                ),
              ),
            );
          },
        ),
        Card(
          color: KColors.primary.withValues(alpha: .07),
          child: const Padding(
            padding: EdgeInsets.all(KSpacing.md),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.info_outline, color: KColors.primary),
                SizedBox(width: KSpacing.md),
                Expanded(
                  child: KLocalizedText(
                    'আবেদন গ্রহণ, কাজ নিশ্চিত, পেমেন্ট ও বিরোধের জরুরি আপডেট নিরাপত্তার জন্য সব সময় ইনবক্সে থাকবে।',
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: KSpacing.md),
        KLocalizedText(
          'ইনবক্স আপডেট',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: KSpacing.sm),
        Card(
          margin: EdgeInsets.zero,
          child: Column(
            children: _preferenceGroups
                .map(
                  (group) => SwitchListTile(
                    secondary: Icon(group.icon),
                    title: KLocalizedText(group.title),
                    subtitle: KLocalizedText(group.subtitle),
                    value: _groupValue(group, saved),
                    onChanged: _busyGroups.contains(group.id)
                        ? null
                        : (value) => _setGroup(group, value),
                  ),
                )
                .toList(growable: false),
          ),
        ),
        const SizedBox(height: KSpacing.md),
        Card(
          margin: EdgeInsets.zero,
          child: const ListTile(
            leading: Icon(Icons.sms_outlined),
            title: KLocalizedText('Push ও SMS'),
            subtitle: KLocalizedText(
              'Firebase ও SMS সেবা সংযুক্ত হলে এই চ্যানেলগুলোর আলাদা নিয়ন্ত্রণ চালু হবে।',
            ),
          ),
        ),
        const SizedBox(height: KSpacing.lg),
        OutlinedButton.icon(
          onPressed: () => context.push(AppRoutes.notifications),
          icon: const Icon(Icons.notifications_outlined),
          label: const KLocalizedText('নোটিফিকেশন ইনবক্স দেখুন'),
        ),
      ],
    );
  }

  bool _groupValue(_PreferenceGroup group, Map<String, bool> saved) =>
      group.types.every((type) => _overrides[type] ?? saved[type] ?? true);

  Future<void> _setGroup(_PreferenceGroup group, bool value) async {
    final previous = {for (final type in group.types) type: _overrides[type]};
    setState(() {
      _busyGroups.add(group.id);
      for (final type in group.types) {
        _overrides[type] = value;
      }
    });
    try {
      final repository = ref.read(settingsRepositoryProvider);
      for (final type in group.types) {
        await repository.setNotificationPreference(
          type: type,
          isEnabled: value,
        );
      }
      ref.invalidate(notificationPreferencesProvider);
      if (mounted) _snack('নোটিফিকেশন পছন্দ সংরক্ষণ হয়েছে।');
    } on Object catch (error) {
      if (mounted) {
        setState(() {
          for (final entry in previous.entries) {
            if (entry.value == null) {
              _overrides.remove(entry.key);
            } else {
              _overrides[entry.key] = entry.value!;
            }
          }
        });
        _snack(_settingsMessage(error));
      }
    } finally {
      if (mounted) setState(() => _busyGroups.remove(group.id));
    }
  }

  void _snack(String message) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: KLocalizedText(message)));
}

class PrivacySettingsScreen extends StatefulWidget {
  const PrivacySettingsScreen({
    this.permissionGateway = const PermissionGateway(),
    super.key,
  });

  final PermissionGateway permissionGateway;

  @override
  State<PrivacySettingsScreen> createState() => _PrivacySettingsScreenState();
}

class _PrivacySettingsScreenState extends State<PrivacySettingsScreen>
    with WidgetsBindingObserver {
  late Future<Map<KPermission, KPermissionStatus>> _statuses;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _statuses = _loadStatuses();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      setState(() {
        _statuses = _loadStatuses();
      });
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  Future<Map<KPermission, KPermissionStatus>> _loadStatuses() async {
    final values = await Future.wait(
      KPermission.values.map(widget.permissionGateway.status),
    );
    return Map.fromIterables(KPermission.values, values);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const KLocalizedText('গোপনীয়তা ও অনুমতি')),
    body: ListView(
      padding: const EdgeInsets.all(KSpacing.md),
      children: [
        _InfoCard(
          icon: Icons.visibility_outlined,
          title: 'যা অন্যরা দেখতে পারেন',
          body:
              'নাম, সাধারণ এলাকা, দক্ষতা, রেটিং, যাচাই ব্যাজ এবং আপনি যোগ করা পোর্টফোলিও।',
        ),
        const SizedBox(height: KSpacing.md),
        _InfoCard(
          icon: Icons.lock_outline,
          title: 'যা সব সময় ব্যক্তিগত',
          body:
              'ফোন নম্বর, সঠিক ঠিকানা, জন্মতারিখ, NID, সেলফি ও যাচাইয়ের নথি কখনো পাবলিক প্রোফাইলে দেখানো হয় না।',
        ),
        const SizedBox(height: KSpacing.lg),
        KLocalizedText(
          'ফোনের অনুমতি',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: KSpacing.sm),
        FutureBuilder<Map<KPermission, KPermissionStatus>>(
          future: _statuses,
          builder: (context, snapshot) {
            if (!snapshot.hasData) {
              return const Card(
                child: Padding(
                  padding: EdgeInsets.all(KSpacing.lg),
                  child: Center(child: CircularProgressIndicator()),
                ),
              );
            }
            return Card(
              margin: EdgeInsets.zero,
              child: Column(
                children: KPermission.values
                    .map(
                      (permission) => ListTile(
                        leading: Icon(_permissionIcon(permission)),
                        title: KLocalizedText(_permissionName(permission)),
                        subtitle: KLocalizedText(_permissionReason(permission)),
                        trailing: _PermissionStatusChip(
                          status: snapshot.data![permission]!,
                        ),
                      ),
                    )
                    .toList(growable: false),
              ),
            );
          },
        ),
        const SizedBox(height: KSpacing.md),
        OutlinedButton.icon(
          onPressed: widget.permissionGateway.openSettings,
          icon: const Icon(Icons.settings_outlined),
          label: const KLocalizedText('ফোনের অনুমতি সেটিংস খুলুন'),
        ),
        const SizedBox(height: KSpacing.lg),
        const _InfoCard(
          icon: Icons.location_on_outlined,
          title: 'লোকেশন ব্যবহার',
          body:
              'লোকেশন শুধু কাজের সময় চেক-ইন/চেক-আউট যাচাইয়ের জন্য নেওয়া হয়। অনুমতি না দিলে ম্যানুয়াল সহায়তা পথ ব্যবহার করতে হবে।',
        ),
      ],
    ),
  );
}

class DataAccountScreen extends ConsumerStatefulWidget {
  const DataAccountScreen({super.key});

  @override
  ConsumerState<DataAccountScreen> createState() => _DataAccountScreenState();
}

class _DataAccountScreenState extends ConsumerState<DataAccountScreen> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final account = ref.watch(accountSummaryProvider);
    return Scaffold(
      appBar: AppBar(title: const KLocalizedText('তথ্য ও অ্যাকাউন্ট')),
      body: ListView(
        padding: const EdgeInsets.all(KSpacing.md),
        children: [
          account.when(
            loading: () => const Card(
              child: Padding(
                padding: EdgeInsets.all(KSpacing.lg),
                child: Center(child: CircularProgressIndicator()),
              ),
            ),
            error: (error, _) => Card(
              child: ListTile(
                leading: const Icon(Icons.error_outline),
                title: const KLocalizedText('অ্যাকাউন্ট তথ্য লোড হয়নি'),
                subtitle: KLocalizedText(_settingsMessage(error)),
                trailing: IconButton(
                  onPressed: () => ref.invalidate(accountSummaryProvider),
                  icon: const Icon(Icons.refresh),
                ),
              ),
            ),
            data: (value) => Card(
              child: ListTile(
                leading: const CircleAvatar(child: Icon(Icons.person_outline)),
                title: const KLocalizedText('যাচাই করা ফোন'),
                subtitle: KLocalizedText(value.maskedPhone),
                trailing: const Icon(Icons.verified, color: KColors.success),
              ),
            ),
          ),
          const SizedBox(height: KSpacing.lg),
          KLocalizedText(
            'সেশন ও ডিভাইস',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: KSpacing.sm),
          Card(
            margin: EdgeInsets.zero,
            child: ListTile(
              leading: const Icon(Icons.phonelink_lock_outlined),
              title: const KLocalizedText('সব ডিভাইস থেকে সাইন আউট'),
              subtitle: const KLocalizedText(
                'হারানো বা অপরিচিত ডিভাইসের প্রবেশ বন্ধ করুন',
              ),
              trailing: _busy
                  ? const SizedBox.square(
                      dimension: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.chevron_right),
              onTap: _busy ? null : _logoutAll,
            ),
          ),
          const SizedBox(height: KSpacing.lg),
          KLocalizedText(
            'অ্যাকাউন্ট মুছে ফেলা',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: KSpacing.sm),
          Card(
            margin: EdgeInsets.zero,
            color: KColors.danger.withValues(alpha: .05),
            child: Padding(
              padding: const EdgeInsets.all(KSpacing.md),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const KLocalizedText(
                    'অ্যাকাউন্ট মুছলে প্রোফাইল আর দেখা যাবে না এবং সব ডিভাইস সাইন আউট হবে। রিভিউ পরিচয়বিহীনভাবে এবং আইনগত আর্থিক রেকর্ড নির্ধারিত সময় রাখা হতে পারে।',
                  ),
                  const SizedBox(height: KSpacing.sm),
                  const KLocalizedText(
                    'চলমান কাজ বা খোলা বিরোধ থাকলে অনুরোধ গ্রহণ করা হবে না।',
                    style: TextStyle(fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: KSpacing.md),
                  OutlinedButton.icon(
                    onPressed: _busy ? null : _deleteAccount,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: KColors.danger,
                    ),
                    icon: const Icon(Icons.delete_forever_outlined),
                    label: const KLocalizedText('অ্যাকাউন্ট মুছে ফেলুন'),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _logoutAll() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const KLocalizedText('সব ডিভাইস থেকে সাইন আউট?'),
        content: const KLocalizedText(
          'সব ফোনে আবার OTP দিয়ে প্রবেশ করতে হবে।',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const KLocalizedText('বাতিল'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const KLocalizedText('সাইন আউট'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _busy = true);
    try {
      await ref.read(authControllerProvider.notifier).logoutAll();
    } on Object catch (error) {
      if (mounted) _snack(_settingsMessage(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _deleteAccount() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => const _DeleteAccountDialog(),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _busy = true);
    try {
      await ref.read(settingsRepositoryProvider).requestAccountDeletion();
      await ref.read(authControllerProvider.notifier).logout();
    } on Object catch (error) {
      if (mounted) _snack(_settingsMessage(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _snack(String message) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: KLocalizedText(message)));
}

class _SettingsSection extends StatelessWidget {
  const _SettingsSection({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Padding(
        padding: const EdgeInsets.only(left: KSpacing.xs, bottom: KSpacing.sm),
        child: KLocalizedText(
          title,
          style: Theme.of(context).textTheme.titleSmall,
        ),
      ),
      Column(children: children),
    ],
  );
}

class _SettingsTile extends StatelessWidget {
  const _SettingsTile({
    required this.icon,
    required this.title,
    required this.onTap,
    this.subtitle,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Card(
    margin: const EdgeInsets.only(bottom: KSpacing.sm),
    clipBehavior: Clip.antiAlias,
    child: ListTile(
      leading: Icon(icon),
      title: KLocalizedText(title),
      subtitle: subtitle == null ? null : KLocalizedText(subtitle!),
      trailing: const Icon(
        Icons.chevron_right_rounded,
        color: KColors.textSecondary,
      ),
      onTap: onTap,
    ),
  );
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({
    required this.icon,
    required this.title,
    required this.body,
  });

  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) => Card(
    margin: EdgeInsets.zero,
    child: Padding(
      padding: const EdgeInsets.all(KSpacing.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: KColors.primary),
          const SizedBox(width: KSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                KLocalizedText(
                  title,
                  style: Theme.of(context).textTheme.titleSmall,
                ),
                const SizedBox(height: KSpacing.xs),
                KLocalizedText(body),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

class _PermissionStatusChip extends StatelessWidget {
  const _PermissionStatusChip({required this.status});

  final KPermissionStatus status;

  @override
  Widget build(BuildContext context) {
    final granted = status == KPermissionStatus.granted;
    return Semantics(
      label: KaajLocalizations.text(
        context,
        granted ? 'অনুমতি দেওয়া আছে' : 'অনুমতি বন্ধ',
      ),
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: KSpacing.sm,
          vertical: KSpacing.xs,
        ),
        decoration: BoxDecoration(
          color: (granted ? KColors.success : KColors.warning).withValues(
            alpha: .1,
          ),
          borderRadius: BorderRadius.circular(99),
        ),
        child: KLocalizedText(granted ? 'চালু' : 'বন্ধ'),
      ),
    );
  }
}

class _DeleteAccountDialog extends StatefulWidget {
  const _DeleteAccountDialog();

  @override
  State<_DeleteAccountDialog> createState() => _DeleteAccountDialogState();
}

class _DeleteAccountDialogState extends State<_DeleteAccountDialog> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final confirmationWord = KaajLocalizations.text(context, 'মুছুন');
    return AlertDialog(
      title: const KLocalizedText('অ্যাকাউন্ট মুছে ফেলবেন?'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          KLocalizedText(
            KaajLocalizations.isEnglish(context)
                ? 'This is difficult to undo. Type “Delete” below to confirm.'
                : 'এটি ফিরিয়ে নেওয়া কঠিন। নিশ্চিত করতে নিচে “মুছুন” লিখুন।',
          ),
          const SizedBox(height: KSpacing.md),
          TextField(
            controller: _controller,
            autofocus: true,
            decoration: InputDecoration(labelText: confirmationWord),
            onChanged: (_) => setState(() {}),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, false),
          child: const KLocalizedText('বাতিল'),
        ),
        FilledButton(
          onPressed: _controller.text.trim() == confirmationWord
              ? () => Navigator.pop(context, true)
              : null,
          style: FilledButton.styleFrom(backgroundColor: KColors.danger),
          child: const KLocalizedText('স্থায়ীভাবে মুছুন'),
        ),
      ],
    );
  }
}

class _PreferenceGroup {
  const _PreferenceGroup({
    required this.id,
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.types,
  });

  final String id;
  final String title;
  final String subtitle;
  final IconData icon;
  final List<String> types;
}

const _preferenceGroups = [
  _PreferenceGroup(
    id: 'applications',
    title: 'নতুন আবেদন ও বুকিং',
    subtitle: 'আপনার পোস্টে আবেদন বা নতুন বুকিং অনুরোধ',
    icon: Icons.assignment_ind_outlined,
    types: ['JOB_APPLICATION_RECEIVED', 'BOOKING_REQUESTED'],
  ),
  _PreferenceGroup(
    id: 'progress',
    title: 'কাজের অগ্রগতি',
    subtitle: 'চেক-ইন, কাজ জমা ও রিভিউ মনে করানো',
    icon: Icons.task_alt_outlined,
    types: ['WORKER_CHECKED_IN', 'WORK_SUBMITTED', 'WORK_REVIEW_REMINDER'],
  ),
  _PreferenceGroup(
    id: 'messages',
    title: 'নতুন বার্তা',
    subtitle: 'কাজের আলোচনায় নতুন মেসেজ',
    icon: Icons.chat_bubble_outline,
    types: ['CHAT_MESSAGE'],
  ),
  _PreferenceGroup(
    id: 'reviews',
    title: 'রিভিউ',
    subtitle: 'আপনার কাজ সম্পর্কে নতুন মতামত',
    icon: Icons.star_outline,
    types: ['REVIEW_RECEIVED'],
  ),
];

IconData _permissionIcon(KPermission permission) => switch (permission) {
  KPermission.camera => Icons.photo_camera_outlined,
  KPermission.location => Icons.location_on_outlined,
  KPermission.notifications => Icons.notifications_outlined,
  KPermission.photos => Icons.photo_library_outlined,
};

String _permissionName(KPermission permission) => switch (permission) {
  KPermission.camera => 'ক্যামেরা',
  KPermission.location => 'লোকেশন',
  KPermission.notifications => 'নোটিফিকেশন',
  KPermission.photos => 'ছবি',
};

String _permissionReason(KPermission permission) => switch (permission) {
  KPermission.camera => 'কাজ, প্রোফাইল ও যাচাইয়ের ছবি তুলতে',
  KPermission.location => 'কাজের উপস্থিতি যাচাই করতে',
  KPermission.notifications => 'কাজ ও বার্তার আপডেট জানতে',
  KPermission.photos => 'পোর্টফোলিও ও প্রমাণের ছবি বেছে নিতে',
};

String _settingsMessage(Object error) {
  if (error is Failure) {
    final lower = error.message.toLowerCase();
    if (lower.contains('active work') || lower.contains('dispute')) {
      return 'চলমান কাজ বা খোলা বিরোধ শেষ করে আবার চেষ্টা করুন।';
    }
    if (lower.contains('network') || lower.contains('connection')) {
      return 'ইন্টারনেট সংযোগ নেই। সংযোগ ঠিক করে আবার চেষ্টা করুন।';
    }
  }
  return 'কাজটি সম্পন্ন হয়নি। আবার চেষ্টা করুন।';
}
