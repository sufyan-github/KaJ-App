import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/session/user_session.dart';
import '../../auth/presentation/controllers/auth_providers.dart';
import '../data/idea_repository.dart';
import '../domain/idea_models.dart';

final ideaRepositoryProvider = Provider<IdeaRepository>((ref) {
  ref.watch(sessionEpochProvider);
  return IdeaRepository(ref.watch(dioProvider));
});

final ideaSectorsProvider = FutureProvider.autoDispose<List<IdeaNamed>>(
  (ref) => ref.watch(ideaRepositoryProvider).sectors(),
);

final ideaSearchProvider = FutureProvider.autoDispose
    .family<List<Idea>, IdeaFilter>(
      (ref, filter) => ref.watch(ideaRepositoryProvider).search(filter),
    );

final myIdeasProvider = FutureProvider.autoDispose<MyIdeas>(
  (ref) => ref.watch(ideaRepositoryProvider).mine(),
);

final myIdeaAccessProvider = FutureProvider.autoDispose<List<MyIdeaAccess>>(
  (ref) => ref.watch(ideaRepositoryProvider).myAccess(),
);

final ideaDetailProvider = FutureProvider.autoDispose.family<Idea, String>(
  (ref, id) => ref.watch(ideaRepositoryProvider).detail(id),
);

final ideaAccessRequestsProvider = FutureProvider.autoDispose
    .family<List<IdeaAccessRequest>, String>(
      (ref, id) => ref.watch(ideaRepositoryProvider).accessRequests(id),
    );

final ideaViewsProvider = FutureProvider.autoDispose
    .family<List<IdeaView>, String>(
      (ref, id) => ref.watch(ideaRepositoryProvider).views(id),
    );

final ideaRoleMatchesProvider = FutureProvider.autoDispose
    .family<IdeaRoleMatches, ({String ideaId, String roleId})>(
      (ref, key) =>
          ref.watch(ideaRepositoryProvider).matches(key.ideaId, key.roleId),
    );

final ideaTeamProvider = FutureProvider.autoDispose.family<IdeaTeam, String>(
  (ref, id) => ref.watch(ideaRepositoryProvider).team(id),
);

final ideaAgreedCollaborationsProvider = FutureProvider.autoDispose
    .family<List<IdeaCollaboration>, String>(
      (ref, id) => ref.watch(ideaRepositoryProvider).agreedCollaborations(id),
    );
