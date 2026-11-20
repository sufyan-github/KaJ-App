import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/session/user_session.dart';
import '../../auth/presentation/controllers/auth_providers.dart';
import '../data/community_repository.dart';
import '../domain/community_models.dart';

final communityRepositoryProvider = Provider<CommunityRepository>((ref) {
  ref.watch(sessionEpochProvider);
  return CommunityRepository(ref.watch(dioProvider));
});

/// First page of `received` or `sent` introductions.
final introductionsProvider = FutureProvider.autoDispose
    .family<List<Introduction>, String>(
      (ref, box) => ref.watch(communityRepositoryProvider).introductions(box),
    );

final introductionProvider = FutureProvider.autoDispose
    .family<Introduction, String>(
      (ref, id) => ref.watch(communityRepositoryProvider).introduction(id),
    );

/// Ideas (owned and team) and businesses to ask an expert about.
final introductionContextsProvider = FutureProvider.autoDispose
    .family<List<ContextChoice>, IntroductionContext>((ref, type) {
      final repository = ref.watch(communityRepositoryProvider);
      return switch (type) {
        IntroductionContext.idea => repository.myIdeas(),
        IntroductionContext.business => repository.myBusinesses(),
        IntroductionContext.learningGoal => Future.value(const []),
      };
    });

/// Free times of an expert for the next 14 days.
final expertSlotsProvider = FutureProvider.autoDispose
    .family<List<ExpertSlot>, String>((ref, expertUserId) {
      final now = DateTime.now();
      return ref
          .watch(communityRepositoryProvider)
          .expertSlots(
            expertUserId,
            from: now,
            to: now.add(const Duration(days: 14)),
          );
    });

/// First page of `hosting` or `attending` sessions.
final sessionsProvider = FutureProvider.autoDispose
    .family<List<CommunitySession>, String>(
      (ref, role) => ref.watch(communityRepositoryProvider).sessions(role),
    );

final sessionProvider = FutureProvider.autoDispose
    .family<CommunitySession, String>(
      (ref, id) => ref.watch(communityRepositoryProvider).session(id),
    );

final sessionFeedbackProvider = FutureProvider.autoDispose
    .family<SessionFeedbackState, String>(
      (ref, id) => ref.watch(communityRepositoryProvider).sessionFeedback(id),
    );

final peopleDirectoryProvider = FutureProvider.autoDispose<List<PersonChoice>>(
  (ref) => ref.watch(communityRepositoryProvider).people(),
);

typedef GroupSearch = ({String q, String? locationId, bool womenOnly});

final groupSearchProvider = FutureProvider.autoDispose
    .family<List<CommunityGroup>, GroupSearch>(
      (ref, search) => ref
          .watch(communityRepositoryProvider)
          .searchGroups(
            q: search.q,
            locationId: search.locationId,
            womenOnly: search.womenOnly,
          ),
    );

final myGroupsProvider = FutureProvider.autoDispose<List<CommunityGroup>>(
  (ref) => ref.watch(communityRepositoryProvider).myGroups(),
);

final groupProvider = FutureProvider.autoDispose.family<CommunityGroup, String>(
  (ref, id) => ref.watch(communityRepositoryProvider).group(id),
);

typedef MemberList = ({String groupId, String status});

final groupMembersProvider = FutureProvider.autoDispose
    .family<List<GroupMember>, MemberList>(
      (ref, list) => ref
          .watch(communityRepositoryProvider)
          .members(list.groupId, status: list.status),
    );

final groupAnnouncementsProvider = FutureProvider.autoDispose
    .family<List<GroupAnnouncement>, String>(
      (ref, id) => ref.watch(communityRepositoryProvider).announcements(id),
    );

final groupSessionsProvider = FutureProvider.autoDispose
    .family<List<CommunitySession>, String>(
      (ref, id) => ref.watch(communityRepositoryProvider).groupSessions(id),
    );
