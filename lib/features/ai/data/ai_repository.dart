import 'package:dio/dio.dart';

import '../../../core/errors/error_mapper.dart';
import '../domain/ai_models.dart';

/// KAAJ AI routes. The app never talks to the model itself.
class AiRepository {
  const AiRepository(this._dio);

  final Dio _dio;

  Future<AiStatus> status() => _guard(() async {
    final response = await _dio.get<Map<String, dynamic>>('/ai/status');
    return AiStatus.fromJson(_data(response.data));
  });

  Future<void> giveConsent(int version) => _guard(() async {
    await _dio.post<Map<String, dynamic>>(
      '/ai/consent',
      data: {'version': version},
    );
  });

  Future<void> withdrawConsent() => _guard(() async {
    await _dio.delete<Map<String, dynamic>>('/ai/consent');
  });

  Future<IdeaAnalysis> storedAnalysis(String ideaId) => _guard(() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/ideas/$ideaId/ai-analysis',
    );
    return IdeaAnalysis.fromJson(_data(response.data));
  });

  Future<IdeaAnalysis> analyseIdea(String ideaId, String locale) =>
      _guard(() async {
        final response = await _dio.post<Map<String, dynamic>>(
          '/ideas/$ideaId/ai-analysis',
          data: {'locale': locale},
        );
        return IdeaAnalysis.fromJson(_data(response.data));
      });

  /// Turns on AI analysis for one idea (`aiConsent` on the idea).
  Future<void> allowIdeaAnalysis(String ideaId) => _guard(() async {
    await _dio.patch<Map<String, dynamic>>(
      '/ideas/$ideaId',
      data: {'aiConsent': true},
    );
  });

  Future<AiSuggestions> suggestions(String locale) => _guard(() async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/ai/opportunity-suggestions',
      data: {'locale': locale},
    );
    return AiSuggestions.fromJson(_data(response.data));
  });

  Future<AiGrowthTips> growthTips(String businessId, String locale) =>
      _guard(() async {
        final response = await _dio.post<Map<String, dynamic>>(
          '/businesses/$businessId/ai-growth-tips',
          data: {'locale': locale},
        );
        return AiGrowthTips.fromJson(_data(response.data));
      });

  Map<String, dynamic> _data(Map<String, dynamic>? envelope) {
    final data = envelope?['data'];
    return data is Map ? Map<String, dynamic>.from(data) : const {};
  }

  Future<T> _guard<T>(Future<T> Function() work) async {
    try {
      return await work();
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }
}
