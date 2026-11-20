import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/session/user_session.dart';
import '../../auth/presentation/controllers/auth_providers.dart';
import '../data/ai_repository.dart';
import '../domain/ai_models.dart';

final aiRepositoryProvider = Provider<AiRepository>((ref) {
  ref.watch(sessionEpochProvider);
  return AiRepository(ref.watch(dioProvider));
});

/// Whether AI is on, the consent state and the daily quotas. Any failure
/// (an older server, no connection) reads as "AI off", so AI entry points
/// stay hidden rather than broken.
final aiStatusProvider = FutureProvider.autoDispose<AiStatus>((ref) async {
  try {
    return await ref.watch(aiRepositoryProvider).status();
  } on Object {
    return AiStatus.off;
  }
});

final storedIdeaAnalysisProvider = FutureProvider.autoDispose
    .family<IdeaAnalysis, String>(
      (ref, ideaId) => ref.watch(aiRepositoryProvider).storedAnalysis(ideaId),
    );
