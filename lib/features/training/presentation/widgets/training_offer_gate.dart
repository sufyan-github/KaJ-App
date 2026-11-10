import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/routing/app_router.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/k_localized_text.dart';
import '../../../auth/presentation/controllers/auth_controller.dart';
import '../../../auth/presentation/controllers/auth_providers.dart';
import '../../data/training_offer_store.dart';
import '../../data/training_repository.dart';
import '../../domain/training_models.dart';
import '../training_providers.dart';
import 'training_ui.dart';

/// Offers optional training to a signed-in worker, at most twice per account.
///
/// It never blocks anything: the sheet can be dismissed, and dismissing it
/// counts as "Later". Customers and unfinished sign-ins never see it.
class TrainingOfferGate extends ConsumerStatefulWidget {
  const TrainingOfferGate({required this.child, super.key});

  final Widget child;

  @override
  ConsumerState<TrainingOfferGate> createState() => _TrainingOfferGateState();
}

class _TrainingOfferGateState extends ConsumerState<TrainingOfferGate> {
  bool _checked = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _maybeOffer());
  }

  Future<void> _maybeOffer() async {
    if (_checked || !mounted) return;
    final auth = ref.read(authControllerProvider);
    // Not ready yet: the listeners in build try again when sign-in settles.
    // Onboarding is not checked here because the router only reaches home
    // after onboarding, and accounts created earlier skip it entirely. The
    // server role below decides who is a worker.
    if (auth.status != AuthStatus.authenticated ||
        !auth.accessChecked ||
        !auth.subscriptionAccess ||
        auth.needsPasswordSetup) {
      return;
    }
    _checked = true;
    try {
      final isWorker = await ref.read(serverRoleIsWorkerProvider.future);
      final ownerId = await ref.read(trainingOwnerIdProvider.future);
      if (!isWorker || ownerId == null || !mounted) return;
      final store = ref.read(trainingOfferStoreProvider);
      final now = ref.read(trainingClockProvider)();
      final record = store.read(ownerId);
      if (!TrainingOfferPolicy.shouldShow(record, now)) return;
      final courses = await ref.read(
        trainingCoursesProvider(CourseScope.mine).future,
      );
      final relevant = courses
          .where(
            (course) =>
                !course.hasCertificate &&
                course.relevance != CourseRelevance.other,
          )
          .toList(growable: false);
      if (relevant.isEmpty || !mounted) return;
      // Recorded before the sheet opens, as a "Later", so a crash or a swipe
      // away still counts as one showing.
      await store.write(
        ownerId,
        TrainingOfferRecord(
          timesShown: record.timesShown + 1,
          lastAction: TrainingOfferAction.later,
          lastActionAt: now,
        ),
      );
      if (!mounted) return;
      final choice = await showModalBottomSheet<_OfferChoice>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (_) => TrainingOfferSheet(courses: relevant),
      );
      if (choice == null || !mounted) return;
      await store.write(
        ownerId,
        TrainingOfferRecord(
          timesShown: record.timesShown + 1,
          lastAction: choice.route == null
              ? TrainingOfferAction.later
              : TrainingOfferAction.accepted,
          lastActionAt: now,
        ),
      );
      if (choice.route case final route? when mounted) {
        unawaited(context.push(route));
      }
    } on Object {
      // The offer is a nicety. Any failure simply means no offer this time.
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(authControllerProvider, (_, _) => _maybeOffer());
    return widget.child;
  }
}

class _OfferChoice {
  const _OfferChoice(this.route);

  final String? route;
}

class TrainingOfferSheet extends StatelessWidget {
  const TrainingOfferSheet({required this.courses, super.key});

  final List<CourseSummary> courses;

  @override
  Widget build(BuildContext context) {
    final language = languageOf(context);
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * .85,
        ),
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.fromLTRB(
            KSpacing.lg,
            0,
            KSpacing.lg,
            KSpacing.lg,
          ),
          children: [
            KLocalizedText(
              'আপনার কাজের জন্য ঐচ্ছিক প্রশিক্ষণ',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: KSpacing.xs),
            const KLocalizedText(
              'প্রশিক্ষণ ছাড়াও কাজে আবেদন করতে পারবেন। পরীক্ষায় পাস করলে প্রোফাইলে সার্টিফিকেট দেখা যাবে।',
              style: TextStyle(color: KColors.textSecondary),
            ),
            const SizedBox(height: KSpacing.md),
            for (final course in courses.take(3))
              Card(
                key: ValueKey('offer-${course.id}'),
                margin: const EdgeInsets.only(bottom: KSpacing.sm),
                child: Padding(
                  padding: const EdgeInsets.all(KSpacing.md),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        course.titleFor(language),
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: KSpacing.xs),
                      CourseMetaLine(course: course),
                      const SizedBox(height: KSpacing.sm),
                      FilledButton(
                        onPressed: () => Navigator.pop(
                          context,
                          _OfferChoice(AppRoutes.trainingCourse(course.id)),
                        ),
                        child: const KLocalizedText('এখনই শুরু করুন'),
                      ),
                      const SizedBox(height: KSpacing.xs),
                      OutlinedButton(
                        onPressed: () => Navigator.pop(
                          context,
                          _OfferChoice(AppRoutes.trainingTest(course.id)),
                        ),
                        child: const KLocalizedText(
                          'আমি অভিজ্ঞ — সরাসরি পরীক্ষা দিই',
                          textAlign: TextAlign.center,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            TextButton(
              key: const ValueKey('offer-later'),
              onPressed: () => Navigator.pop(context, const _OfferChoice(null)),
              child: const KLocalizedText('পরে'),
            ),
          ],
        ),
      ),
    );
  }
}
