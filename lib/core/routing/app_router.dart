import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/activity/my_activity_screen.dart';
import '../../features/auth/domain/entities/otp_challenge.dart';
import '../../features/auth/presentation/controllers/auth_controller.dart';
import '../../features/auth/presentation/controllers/auth_providers.dart';
import '../../features/auth/presentation/screens/otp_verify_screen.dart';
import '../../features/auth/presentation/screens/password_screens.dart';
import '../../features/auth/presentation/screens/phone_entry_screen.dart';
import '../../features/billing/presentation/billing_screens.dart';
import '../../features/bootstrap/presentation/screens/splash_screen.dart';
import '../../features/chat/presentation/screens/chat_screens.dart';
import '../../features/explore/explore_screen.dart';
import '../../features/help/presentation/help_centre_screen.dart';
import '../../features/home/presentation/screens/home_screen.dart';
import '../../features/jobs/presentation/screens/job_alerts_screen.dart';
import '../../features/jobs/presentation/screens/job_detail_screen.dart';
import '../../features/jobs/presentation/screens/jobs_screens.dart';
import '../../features/learning/presentation/enrolment_screens.dart';
import '../../features/learning/presentation/learning_detail_screen.dart';
import '../../features/learning/presentation/publish_learning_screen.dart';
import '../../features/mentor/presentation/mentor_screen.dart';
import '../../features/notifications/presentation/screens/notifications_screen.dart';
import '../../features/onboarding/domain/onboarding_state.dart';
import '../../features/onboarding/presentation/controllers/onboarding_controller.dart';
import '../../features/onboarding/presentation/screens/onboarding_screens.dart';
import '../../features/profile/presentation/screens/edit_profile_screen.dart';
import '../../features/profile/presentation/screens/phase2_hub_screens.dart';
import '../../features/settings/presentation/settings_screens.dart';
import '../../features/training/presentation/screens/certificates_screen.dart';
import '../../features/training/presentation/screens/course_screen.dart';
import '../../features/training/presentation/screens/training_catalog_screen.dart';
import '../../features/training/presentation/screens/training_test_screen.dart';
import '../../features/trust_safety/presentation/attendance_screen.dart';
import '../../features/trust_safety/presentation/dispute_screens.dart';
import '../../features/trust_safety/presentation/safety_screens.dart';
import '../../features/trust_safety/presentation/verification_screens.dart';
import 'route_arguments.dart';

abstract final class AppRoutes {
  static const register = '/auth/register';
  static const accessCheck = '/auth/access';
  static const passwordSetup = '/auth/password/setup';
  static const passwordRecovery = '/auth/password/recovery';
  static const splash = '/';
  static const phone = '/auth/phone';
  static const otp = '/auth/otp';
  static const home = '/home';
  static const onboardingProfile = '/onboarding/profile';
  static const onboardingRole = '/onboarding/role';
  static const onboardingLocation = '/onboarding/location';
  static const onboardingSkills = '/onboarding/worker';
  static const onboardingAvailability = '/onboarding/availability';
  static const onboardingTour = '/onboarding/tour';
  static const categories = '/categories';
  static const publicWorkerProfile = '/workers/preview';
  static const workerProfilePath = '/workers/:id/profile';
  static const editWorkerSkills = '/w/profile/skills';
  static const editAvailability = '/w/availability';
  static const settings = '/settings';
  static const notificationSettings = '/settings/notifications';
  static const privacySettings = '/settings/privacy';
  static const accountSettings = '/settings/account';
  static const subscription = '/settings/subscription';
  static const jobPayments = '/settings/job-payments';
  static const helpSafety = '/help-safety';
  static const jobs = '/jobs';
  static const createJob = '/jobs/create';
  static const workers = '/workers';
  static const assignments = '/assignments';
  static const assignmentDetailPath = '/assignments/:id';
  static const notifications = '/notifications';
  static const reviews = '/reviews';
  static const favorites = '/favorites';
  static const conversations = '/conversations';
  static const chatThreadPath = '/conversations/:id';
  static const workerBookingPath = '/workers/:id/book';
  static const verification = '/verification';
  static const verificationCapturePath = '/verification/:kind/capture';
  static const attendancePath = '/assignments/:id/attendance';
  static const disputes = '/disputes';
  static const disputePath = '/disputes/:id';
  static const openDisputePath = '/assignments/:id/dispute';
  static const blockedUsers = '/settings/blocked';
  static const reportPath = '/report/:type/:id';
  static const portfolio = '/w/profile/portfolio';
  static const training = '/training';
  static const trainingCoursePath = '/training/courses/:id';
  static const trainingTestPath = '/training/courses/:id/test';
  static const trainingCertificates = '/training/certificates';
  static const jobDetailPath = '/jobs/:id';
  static const editProfile = '/profile/edit';
  static const jobAlerts = '/settings/job-alerts';
  static const help = '/help';
  static const explore = '/explore';
  static const exploreLearn = '/explore?section=learn';
  static const activity = '/activity';
  static const activityLearning = '/activity?section=learning';
  static const mentor = '/mentor';
  static const learningOpportunityPath = '/learn/opportunities/:id';
  static const publishLearning = '/learn/new';
  static String learningOpportunity(String id) => '/learn/opportunities/$id';
  static const learningEnrolmentPath = '/learn/enrolments/:id';
  static String learningEnrolment(String id) => '/learn/enrolments/$id';

  static String trainingCourse(String id) => '/training/courses/$id';
  static String trainingTest(String id) => '/training/courses/$id/test';
  static String jobDetail(String id) => '/jobs/$id';

  static String workerBooking(String id) => '/workers/$id/book';
  static String workerProfile(String id) => '/workers/$id/profile';

  /// Open jobs in the person's own area.
  static String jobsInArea({
    required String areaId,
    required String areaName,
  }) => Uri(
    path: jobs,
    queryParameters: {'locationId': areaId, 'locationName': areaName},
  ).toString();

  /// Open jobs that fit the worker's saved free time.
  static const jobsMatchingTime = '$jobs?availableOnly=true';
  static String jobsForType({
    required String categoryId,
    required String categoryName,
    String? skillId,
    String? skillName,
  }) => Uri(
    path: jobs,
    queryParameters: {
      'categoryId': categoryId,
      'categoryName': categoryName,
      'skillId': ?skillId,
      'skillName': ?skillName,
    },
  ).toString();
  static String assignmentDetail(String id) => '/assignments/$id';
  static String verificationCapture(String kind) =>
      '/verification/$kind/capture';
  static String attendance(String id) => '/assignments/$id/attendance';
  static String openDispute(String id) => '/assignments/$id/dispute';
  static String dispute(String id) => '/disputes/$id';
  static String report(String type, String id) => '/report/$type/$id';
  static String chatThread(String id) => '/conversations/$id';
}

final appRouterProvider = Provider<GoRouter>((ref) {
  final refresh = _RouterRefreshNotifier();
  ref
    ..listen<AuthState>(authControllerProvider, (_, _) => refresh.notify())
    ..listen<OnboardingState>(
      onboardingControllerProvider,
      (_, _) => refresh.notify(),
    )
    ..onDispose(refresh.dispose);
  return GoRouter(
    initialLocation: AppRoutes.splash,
    refreshListenable: refresh,
    redirect: (context, state) => authRedirect(
      ref.read(authControllerProvider),
      state.matchedLocation,
      onboarding: ref.read(onboardingControllerProvider),
    ),
    routes: [
      GoRoute(
        path: AppRoutes.splash,
        builder: (context, state) => const SplashScreen(),
      ),
      GoRoute(
        path: AppRoutes.phone,
        builder: (context, state) => const PasswordLoginScreen(),
      ),
      GoRoute(
        path: AppRoutes.register,
        builder: (_, _) => const PhoneEntryScreen(),
      ),
      GoRoute(
        path: AppRoutes.accessCheck,
        builder: (_, _) => const AuthAccessScreen(),
      ),
      GoRoute(
        path: AppRoutes.passwordSetup,
        builder: (_, _) => const PasswordSetupScreen(),
      ),
      GoRoute(
        path: AppRoutes.passwordRecovery,
        builder: (_, _) => const PasswordRecoveryScreen(),
      ),
      GoRoute(
        path: AppRoutes.otp,
        redirect: (context, state) {
          final challenge = otpChallengeForRoute(
            state.extra,
            ref.read(authControllerProvider),
          );
          return challenge == null ? AppRoutes.phone : null;
        },
        builder: (context, state) {
          final challenge = otpChallengeForRoute(
            state.extra,
            ref.read(authControllerProvider),
          )!;
          return OtpVerifyScreen(challenge: challenge);
        },
      ),
      GoRoute(
        path: AppRoutes.home,
        builder: (context, state) => const HomeScreen(),
      ),
      GoRoute(
        path: AppRoutes.onboardingProfile,
        builder: (context, state) => const ProfileSetupScreen(),
      ),
      GoRoute(
        path: AppRoutes.onboardingRole,
        builder: (context, state) => const RoleSelectionScreen(),
      ),
      GoRoute(
        path: AppRoutes.onboardingLocation,
        builder: (context, state) => const LocationSelectionScreen(),
      ),
      GoRoute(
        path: AppRoutes.onboardingSkills,
        builder: (context, state) => const WorkerSkillsScreen(),
      ),
      GoRoute(
        path: AppRoutes.onboardingAvailability,
        builder: (context, state) => const AvailabilitySetupScreen(),
      ),
      GoRoute(
        path: AppRoutes.onboardingTour,
        builder: (context, state) => const OnboardingTourScreen(),
      ),
      GoRoute(
        path: AppRoutes.categories,
        builder: (context, state) => const CategoriesBrowseScreen(),
      ),
      GoRoute(
        path: AppRoutes.publicWorkerProfile,
        builder: (context, state) => const PublicWorkerProfileScreen(),
      ),
      GoRoute(
        path: AppRoutes.editWorkerSkills,
        builder: (context, state) => const WorkerSkillsScreen(isEditing: true),
      ),
      GoRoute(
        path: AppRoutes.editAvailability,
        builder: (context, state) =>
            const AvailabilitySetupScreen(isEditing: true),
      ),
      GoRoute(
        path: AppRoutes.settings,
        builder: (context, state) => const SettingsScreen(),
      ),
      GoRoute(
        path: AppRoutes.notificationSettings,
        builder: (context, state) => const NotificationPreferencesScreen(),
      ),
      GoRoute(
        path: AppRoutes.privacySettings,
        builder: (context, state) => const PrivacySettingsScreen(),
      ),
      GoRoute(
        path: AppRoutes.accountSettings,
        builder: (context, state) => const DataAccountScreen(),
      ),
      GoRoute(
        path: AppRoutes.subscription,
        builder: (context, state) => const SubscriptionScreen(),
      ),
      GoRoute(
        path: AppRoutes.jobPayments,
        builder: (context, state) => const JobPaymentHistoryScreen(),
      ),
      GoRoute(
        path: AppRoutes.helpSafety,
        builder: (context, state) => const HelpSafetyScreen(),
      ),
      GoRoute(
        path: AppRoutes.jobs,
        builder: (context, state) => JobFeedScreen(
          categoryId: state.uri.queryParameters['categoryId'],
          categoryName: state.uri.queryParameters['categoryName'],
          skillId: state.uri.queryParameters['skillId'],
          skillName: state.uri.queryParameters['skillName'],
          locationId: state.uri.queryParameters['locationId'],
          locationName: state.uri.queryParameters['locationName'],
          initialAvailableOnly:
              state.uri.queryParameters['availableOnly'] == 'true',
        ),
      ),
      GoRoute(
        path: AppRoutes.createJob,
        builder: (context, state) => const CreateJobScreen(),
      ),
      GoRoute(
        path: AppRoutes.jobDetailPath,
        builder: (context, state) =>
            JobDetailScreen(jobId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: AppRoutes.workers,
        builder: (context, state) => const WorkerDirectoryScreen(),
      ),
      GoRoute(
        path: AppRoutes.assignments,
        builder: (context, state) => const AssignmentsScreen(),
      ),
      GoRoute(
        path: AppRoutes.assignmentDetailPath,
        builder: (context, state) =>
            AssignmentDetailScreen(assignmentId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: AppRoutes.notifications,
        builder: (context, state) => const NotificationsScreen(),
      ),
      GoRoute(
        path: AppRoutes.reviews,
        builder: (context, state) => const ReceivedReviewsScreen(),
      ),
      GoRoute(
        path: AppRoutes.favorites,
        builder: (context, state) => const FavoriteWorkersScreen(),
      ),
      GoRoute(
        path: AppRoutes.conversations,
        builder: (context, state) => const ChatListScreen(),
      ),
      GoRoute(
        path: AppRoutes.chatThreadPath,
        builder: (context, state) {
          final args = state.extra is ChatThreadArgs
              ? state.extra! as ChatThreadArgs
              : null;
          return ChatThreadScreen(
            conversationId: state.pathParameters['id']!,
            jobTitle: args?.jobTitle,
            otherName: args?.otherName,
            otherUserId: args?.otherUserId,
          );
        },
      ),
      GoRoute(
        path: AppRoutes.workerProfilePath,
        builder: (context, state) =>
            PublicWorkerProfileScreen(workerId: state.pathParameters['id']),
      ),
      GoRoute(
        path: AppRoutes.workerBookingPath,
        builder: (context, state) =>
            WorkerBookingScreen(workerId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: AppRoutes.verification,
        builder: (context, state) => const VerificationCenterScreen(),
      ),
      GoRoute(
        path: AppRoutes.verificationCapturePath,
        builder: (context, state) =>
            VerificationCaptureScreen(kind: state.pathParameters['kind']!),
      ),
      GoRoute(
        path: AppRoutes.attendancePath,
        builder: (context, state) {
          final args = state.extra is AttendanceArgs
              ? state.extra! as AttendanceArgs
              : null;
          return AttendanceScreen(
            assignmentId: state.pathParameters['id']!,
            title: args?.title,
            // A cold deep link cannot prove the opener is the poster, so the
            // override affordance stays off until the screen loads the
            // assignment and can tell.
            isPoster: args?.isPoster ?? false,
          );
        },
      ),
      GoRoute(
        path: AppRoutes.disputes,
        builder: (context, state) => const DisputesScreen(),
      ),
      GoRoute(
        path: AppRoutes.disputePath,
        builder: (context, state) =>
            DisputeDetailScreen(disputeId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: AppRoutes.openDisputePath,
        builder: (context, state) =>
            OpenDisputeScreen(assignmentId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: AppRoutes.blockedUsers,
        builder: (context, state) => const BlockedUsersScreen(),
      ),
      GoRoute(
        path: AppRoutes.reportPath,
        builder: (context, state) => ReportScreen(
          targetType: state.pathParameters['type']!,
          targetId: state.pathParameters['id']!,
        ),
      ),
      GoRoute(
        path: AppRoutes.portfolio,
        builder: (context, state) => const PortfolioScreen(),
      ),
      GoRoute(
        path: AppRoutes.training,
        builder: (context, state) => const TrainingCatalogScreen(),
      ),
      GoRoute(
        path: AppRoutes.trainingCertificates,
        builder: (context, state) => const CertificatesScreen(),
      ),
      GoRoute(
        path: AppRoutes.trainingCoursePath,
        builder: (context, state) =>
            CourseScreen(courseId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: AppRoutes.trainingTestPath,
        builder: (context, state) =>
            TrainingTestScreen(courseId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: AppRoutes.editProfile,
        builder: (context, state) => const EditProfileScreen(),
      ),
      GoRoute(
        path: AppRoutes.jobAlerts,
        builder: (context, state) => const JobAlertsScreen(),
      ),
      GoRoute(
        path: AppRoutes.explore,
        builder: (context, state) => ExploreScreen(
          initial: ExploreSection.parse(state.uri.queryParameters['section']),
        ),
      ),
      // Declared before the detail path so "new" is not read as an id.
      GoRoute(
        path: AppRoutes.publishLearning,
        builder: (context, state) => const PublishLearningScreen(),
      ),
      GoRoute(
        path: AppRoutes.learningOpportunityPath,
        builder: (context, state) =>
            LearningDetailScreen(opportunityId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: AppRoutes.learningEnrolmentPath,
        builder: (context, state) =>
            EnrolmentScreen(enrolmentId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: AppRoutes.mentor,
        builder: (context, state) => const MentorScreen(),
      ),
      GoRoute(
        path: AppRoutes.activity,
        builder: (context, state) => MyActivityScreen(
          initialSection: state.uri.queryParameters['section'] == 'learning'
              ? 1
              : 0,
        ),
      ),
      GoRoute(
        path: AppRoutes.help,
        builder: (context, state) => const HelpCentreScreen(),
      ),
    ],
  );
});

String? authRedirect(
  AuthState auth,
  String location, {
  OnboardingState onboarding = const OnboardingState(),
}) {
  final isSplash = location == AppRoutes.splash;
  final isAuthRoute = {
    AppRoutes.phone,
    AppRoutes.otp,
    AppRoutes.register,
    AppRoutes.passwordRecovery,
  }.contains(location);

  if (auth.status == AuthStatus.initial) {
    return isSplash ? null : AppRoutes.splash;
  }
  if (auth.status == AuthStatus.unauthenticated) {
    return {
          AppRoutes.phone,
          AppRoutes.register,
          AppRoutes.passwordRecovery,
        }.contains(location)
        ? null
        : AppRoutes.phone;
  }
  if (auth.status == AuthStatus.codeSent && !isAuthRoute) {
    return AppRoutes.phone;
  }
  if (auth.status == AuthStatus.authenticated) {
    if (location == AppRoutes.passwordRecovery) return null;
    if (!auth.accessChecked) {
      return location == AppRoutes.accessCheck ? null : AppRoutes.accessCheck;
    }
    if (!auth.subscriptionAccess) {
      if (location == AppRoutes.subscription) return null;
      // Learning is free: without a subscription the learning screens stay
      // open; everything else asks for the subscription as before.
      if (auth.freeModules.contains('LEARN') && isLearningRoute(location)) {
        return null;
      }
      return AppRoutes.subscription;
    }
    if (auth.needsPasswordSetup) {
      return {
            AppRoutes.passwordSetup,
            AppRoutes.subscription,
          }.contains(location)
          ? null
          : AppRoutes.passwordSetup;
    }
    // The server flag survives an app kill; isNewUser only lives in memory
    // after an OTP sign-up.
    if ((auth.isNewUser || auth.onboardingRequired) && !onboarding.started) {
      return location == AppRoutes.onboardingProfile
          ? null
          : AppRoutes.onboardingProfile;
    }
    if (onboarding.started && !onboarding.complete) {
      final target = onboardingRouteForStep(onboarding);
      return location.startsWith('/onboarding/') ? null : target;
    }
    return isSplash ||
            isAuthRoute ||
            location == AppRoutes.accessCheck ||
            location.startsWith('/onboarding/')
        ? AppRoutes.home
        : null;
  }
  if (isSplash && auth.status != AuthStatus.loading) {
    return AppRoutes.phone;
  }
  return null;
}

/// Screens that belong to the Learn module.
bool isLearningRoute(String location) =>
    location == AppRoutes.explore ||
    location == AppRoutes.activity ||
    location == AppRoutes.training ||
    location.startsWith('${AppRoutes.training}/');

String onboardingRouteForStep(OnboardingState state) => switch (state.step) {
  0 => AppRoutes.onboardingProfile,
  1 => AppRoutes.onboardingRole,
  2 => AppRoutes.onboardingLocation,
  3 when state.role == KaajRole.worker => AppRoutes.onboardingSkills,
  4 => AppRoutes.onboardingAvailability,
  _ => AppRoutes.onboardingTour,
};

OtpChallenge? otpChallengeForRoute(Object? extra, AuthState auth) =>
    extra is OtpChallenge ? extra : auth.challenge;

class _RouterRefreshNotifier extends ChangeNotifier {
  void notify() => notifyListeners();
}
