import 'dart:async';

import 'package:flutter/material.dart';
import 'package:youtube_player_iframe/youtube_player_iframe.dart';

import 'lesson_video_request.dart';

/// The origin and Referer the embedded player identifies itself with.
const kaajPlayerOrigin = 'https://app.kaaj.mobile';

/// The official YouTube IFrame player, configured to the YouTube API rules:
/// the video is only cued (never autoplayed), the player is never smaller
/// than 200 x 200, and nothing is drawn on top of it.
class YoutubeLessonPlayer extends StatefulWidget {
  const YoutubeLessonPlayer({required this.request, super.key});

  final LessonVideoRequest request;

  @override
  State<YoutubeLessonPlayer> createState() => _YoutubeLessonPlayerState();
}

class _YoutubeLessonPlayerState extends State<YoutubeLessonPlayer> {
  late final YoutubePlayerController _controller;
  StreamSubscription<YoutubePlayerValue>? _subscription;
  bool _reported = false;

  @override
  void initState() {
    super.initState();
    final language = widget.request.languageCode;
    _controller = YoutubePlayerController(
      params: YoutubePlayerParams(
        origin: kaajPlayerOrigin,
        showFullscreenButton: true,
        strictRelatedVideos: true,
        interfaceLanguage: language,
        captionLanguage: language,
      ),
      onWebResourceError: (error) {
        if (error.isForMainFrame ?? false) _report(-1);
      },
    );
    _subscription = _controller.listen((value) {
      if (value.hasError) _report(value.error.code);
    });
    // Cue only. Loading would start playback, and lessons never autoplay.
    unawaited(_controller.cueVideoById(videoId: widget.request.videoId));
  }

  void _report(int code) {
    if (_reported || !mounted) return;
    _reported = true;
    widget.request.onError(code);
  }

  @override
  void dispose() {
    unawaited(_subscription?.cancel());
    unawaited(_controller.close());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      YoutubePlayer(controller: _controller, aspectRatio: 16 / 9);
}
