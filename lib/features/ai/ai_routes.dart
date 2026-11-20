import 'package:go_router/go_router.dart';

import 'presentation/ai_common.dart';
import 'presentation/ai_consent_screen.dart';
import 'presentation/ai_suggestions.dart';
import 'presentation/growth_tips_screen.dart';
import 'presentation/idea_analysis_screen.dart';

/// KAAJ AI screens. Free to open: the server decides who may generate.
List<RouteBase> aiRoutes() => [
  GoRoute(path: AiPaths.consent, builder: (_, _) => const AiConsentScreen()),
  GoRoute(
    path: AiPaths.suggestions,
    builder: (_, _) => const AiSuggestionsScreen(),
  ),
  GoRoute(
    path: '/ai/ideas/:id/analysis',
    builder: (_, state) =>
        IdeaAnalysisScreen(ideaId: state.pathParameters['id']!),
  ),
  GoRoute(
    path: '/ai/businesses/:id/growth-tips',
    builder: (_, state) =>
        GrowthTipsScreen(businessId: state.pathParameters['id']!),
  ),
];
