import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/network/paged_list.dart';
import '../../../core/session/user_session.dart';
import '../../auth/presentation/controllers/auth_providers.dart';
import '../../trust_safety/presentation/trust_safety_providers.dart';
import '../data/business_repository.dart';
import '../domain/business_models.dart';

final businessRepositoryProvider = Provider<BusinessRepository>((ref) {
  ref.watch(sessionEpochProvider);
  return BusinessRepository(ref.watch(dioProvider));
});

final businessCategoriesProvider =
    FutureProvider.autoDispose<List<BusinessRef>>(
      (ref) => ref.watch(businessRepositoryProvider).categories(),
    );

final myBusinessesProvider = FutureProvider.autoDispose<MyBusinesses>(
  (ref) => ref.watch(businessRepositoryProvider).mine(),
);

final businessDetailProvider = FutureProvider.autoDispose
    .family<Business, String>(
      (ref, id) => ref.watch(businessRepositoryProvider).detail(id),
    );

final businessMembersProvider = FutureProvider.autoDispose
    .family<List<BusinessMember>, String>(
      (ref, id) => ref.watch(businessRepositoryProvider).members(id),
    );

final businessOfferingsProvider = FutureProvider.autoDispose
    .family<List<Offering>, String>(
      (ref, id) => ref.watch(businessRepositoryProvider).offerings(id),
    );

final businessJobsProvider = FutureProvider.autoDispose
    .family<List<BusinessJob>, String>(
      (ref, id) => ref.watch(businessRepositoryProvider).jobs(id),
    );

final businessVerificationProvider = FutureProvider.autoDispose
    .family<BusinessVerification, String>(
      (ref, id) => ref.watch(businessRepositoryProvider).verification(id),
    );

/// The first page of the partner directory for a filter.
final partnersProvider = FutureProvider.autoDispose
    .family<PagedList<Business>, PartnerFilter>(
      (ref, filter) => ref.watch(businessRepositoryProvider).partners(filter),
    );

/// The first page of collaboration requests in a box (received or sent).
final collaborationsProvider = FutureProvider.autoDispose
    .family<CollaborationPage, String>(
      (ref, box) => ref.watch(businessRepositoryProvider).collaborations(box),
    );

final collaborationDetailProvider = FutureProvider.autoDispose
    .family<Collaboration, String>(
      (ref, id) => ref.watch(businessRepositoryProvider).collaboration(id),
    );

/// Picks one document photo (trade licence or other evidence).
final businessDocumentPickerProvider = Provider<Future<Uint8List?> Function()>(
  (ref) => () async {
    final image = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      imageQuality: 92,
      maxWidth: 2400,
    );
    return image?.readAsBytes();
  },
);

/// Uploads one document photo and returns its document id.
final businessDocumentUploaderProvider =
    Provider<Future<String> Function(Uint8List bytes)>((ref) {
      final repository = ref.watch(trustSafetyRepositoryProvider);
      return (bytes) => repository.uploadImage('VERIFICATION_DOCUMENT', bytes);
    });
