import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// The only way remote images should be loaded in the app.
///
/// A bare `Image.network` re-downloads on every rebuild and every time a route
/// is popped and pushed again, because Flutter's image cache is memory-only and
/// small. On prepaid mobile data that is the user's money, so every remote
/// image goes through a disk cache and is decoded no larger than it is drawn.
/// It also guarantees a real placeholder and a real error state, instead of the
/// blank box a raw `Image.network` leaves behind on a slow or failed fetch.
class KNetworkImage extends StatelessWidget {
  const KNetworkImage({
    required this.url,
    this.fit = BoxFit.cover,
    this.width,
    this.height,
    this.borderRadius,
    this.semanticLabel,
    super.key,
  });

  final BorderRadius? borderRadius;
  final BoxFit fit;
  final double? height;
  final String? semanticLabel;
  final String url;
  final double? width;

  @override
  Widget build(BuildContext context) {
    final ratio = MediaQuery.devicePixelRatioOf(context);
    final image = CachedNetworkImage(
      imageUrl: url,
      fit: fit,
      width: width,
      height: height,
      // Decode to the drawn size. A 4 MP portfolio photo shown in a 120 dp
      // grid tile otherwise costs ~16 MB of heap per visible tile.
      memCacheWidth: width == null ? null : (width! * ratio).round(),
      memCacheHeight: height == null ? null : (height! * ratio).round(),
      fadeInDuration: const Duration(milliseconds: 150),
      placeholder: (context, _) => const _ImagePlaceholder(),
      errorWidget: (context, _, _) => const _ImageFailed(),
    );
    final labelled = semanticLabel == null
        ? image
        : Semantics(image: true, label: semanticLabel, child: image);
    return borderRadius == null
        ? labelled
        : ClipRRect(borderRadius: borderRadius!, child: labelled);
  }
}

/// Deliberately static. A spinner in every thumbnail of a grid is visual
/// noise, and a continuously animating placeholder also means a widget test
/// can never reach a settled frame.
class _ImagePlaceholder extends StatelessWidget {
  const _ImagePlaceholder();

  @override
  Widget build(BuildContext context) => const ColoredBox(
    color: KColors.surfaceAlt,
    child: Center(
      child: Icon(Icons.image_outlined, color: KColors.textSecondary, size: 20),
    ),
  );
}

class _ImageFailed extends StatelessWidget {
  const _ImageFailed();

  @override
  Widget build(BuildContext context) => const ColoredBox(
    color: KColors.surfaceAlt,
    child: Center(
      child: Icon(
        Icons.broken_image_outlined,
        color: KColors.textSecondary,
        size: 22,
      ),
    ),
  );
}
