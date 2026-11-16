import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/session/user_session.dart';
import '../../auth/presentation/controllers/auth_providers.dart';
import '../../trust_safety/presentation/trust_safety_providers.dart';
import '../data/mentor_repository.dart';
import '../domain/mentor_models.dart';

final mentorRepositoryProvider = Provider<MentorRepository>((ref) {
  ref.watch(sessionEpochProvider);
  return MentorRepository(ref.watch(dioProvider));
});

/// Re-read whenever the mentor screen opens: an admin may have decided.
final mentorProfileProvider = FutureProvider.autoDispose<MentorProfile>(
  (ref) => ref.watch(mentorRepositoryProvider).mine(),
);

/// Picks one evidence photo (a certificate or a photo of the work).
final mentorEvidencePickerProvider = Provider<Future<Uint8List?> Function()>(
  (ref) => () async {
    final image = await ImagePicker().pickImage(source: ImageSource.gallery);
    return image?.readAsBytes();
  },
);

/// Uploads one evidence photo and returns its document id.
final mentorEvidenceUploaderProvider =
    Provider<Future<String> Function(Uint8List bytes)>((ref) {
      final repository = ref.watch(trustSafetyRepositoryProvider);
      return (bytes) => repository.uploadImage('VERIFICATION_DOCUMENT', bytes);
    });
