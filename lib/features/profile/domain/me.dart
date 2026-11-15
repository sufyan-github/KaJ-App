import '../../onboarding/domain/onboarding_state.dart';
import '../../settings/domain/settings_models.dart';
import 'my_profile.dart';

/// The signed-in person as the server knows them: account, capabilities,
/// active role and area.
///
/// This is the only source the app uses for "who am I" outside onboarding.
/// The onboarding draft on the phone is not, because a returning user on a
/// new phone has no draft.
class Me {
  const Me({
    required this.userId,
    required this.phone,
    required this.roles,
    required this.activeRole,
    required this.displayName,
    required this.skills,
    this.area,
    this.onboardingFlag,
  });

  factory Me.from(AccountSummary account, MyProfile profile) => Me(
    userId: account.id,
    phone: account.phone,
    // Both endpoints read the same user row; the profile is the newer read.
    roles: profile.roles.isNotEmpty ? profile.roles : account.roles,
    activeRole: profile.activeRole.isNotEmpty
        ? profile.activeRole
        : account.activeRole,
    displayName: profile.displayName,
    skills: profile.skills,
    area: profile.primaryLocation,
  );

  final String userId;
  final String phone;

  /// Server role modes (CUSTOMER, WORKER and any added later, such as
  /// MENTOR). These are the person's capabilities.
  final List<String> roles;
  final String activeRole;
  final String displayName;
  final List<MySkill> skills;
  final ProfileArea? area;

  /// An explicit `onboardingRequired` from the server, when it sends one.
  final bool? onboardingFlag;

  Set<String> get capabilities => roles.map((r) => r.toUpperCase()).toSet();

  bool hasCapability(String role) => capabilities.contains(role.toUpperCase());

  /// The app's two home modes. Unknown server roles fall back to customer,
  /// which shows no worker-only actions.
  KaajRole get role => activeRole.toUpperCase() == 'WORKER'
      ? KaajRole.worker
      : KaajRole.customer;

  bool get isWorker => role == KaajRole.worker;

  String? get areaId {
    final id = area?.id;
    return id == null || id.trim().isEmpty ? null : id;
  }

  /// Same rule as the server: an account without a name has not finished
  /// setting up.
  bool get onboardingRequired => onboardingFlag ?? displayName.trim().isEmpty;
}
