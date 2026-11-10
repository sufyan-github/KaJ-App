import 'package:flutter/foundation.dart';

class LessonVideoRequest {
  const LessonVideoRequest({
    required this.videoId,
    required this.languageCode,
    required this.onError,
  });

  final String languageCode;

  /// Called with the IFrame API error code (101 and 150 mean the owner does
  /// not allow embedding), or -1 when the page itself failed to load.
  final ValueChanged<int> onError;
  final String videoId;
}
