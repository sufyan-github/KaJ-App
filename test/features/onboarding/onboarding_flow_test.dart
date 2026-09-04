import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive_ce_flutter/hive_flutter.dart';
import 'package:kaaj/core/storage/session_token_store.dart';
import 'package:kaaj/features/onboarding/data/onboarding_repository.dart';
import 'package:kaaj/features/onboarding/domain/onboarding_state.dart';
import 'package:kaaj/features/onboarding/presentation/controllers/onboarding_controller.dart';

void main() {
  late Directory directory;
  late Box<dynamic> box;

  setUpAll(() async {
    directory = await Directory.systemTemp.createTemp('kaaj_onboarding_flow_');
    Hive.init(directory.path);
  });

  setUp(() async {
    box = await Hive.openBox<dynamic>(onboardingBoxName);
    await box.clear();
  });

  tearDown(() async => box.close());
  tearDownAll(() async => directory.delete(recursive: true));

  test(
    'signup profile role location skills availability survives relaunch',
    () async {
      final adapter = _SuccessAdapter();
      final dio = Dio(BaseOptions(baseUrl: 'https://kaaj.test/api/v1'))
        ..httpClientAdapter = adapter;
      final tokens = SessionTokenStore(const FlutterSecureStorage());
      final repository = OnboardingRepository(dio, box, tokens);
      final firstRun = OnboardingController(repository);

      await firstRun.begin();
      await firstRun.saveProfile('রহিম');
      await firstRun.selectRole(KaajRole.worker);
      await firstRun.selectLocation('018f4f6f-13e8-7d9a-8c2b-6b6a9f62f801');

      // Simulate the process being killed and providers being recreated.
      final relaunched = OnboardingController(OnboardingRepository(dio, box));
      expect(relaunched.state.step, 3);
      expect(relaunched.state.displayName, 'রহিম');
      expect(relaunched.state.role, KaajRole.worker);
      expect(tokens.accessToken, 'worker-access-token');

      await relaunched.saveWorkerSetup([
        '018f4f6f-13e8-7d9a-8c2b-6b6a9f62f802',
      ], hourlyRatePoisha: 50_000);
      await relaunched.saveAvailability(
        [0, 2, 5],
        startTime: '09:30',
        endTime: '16:45',
      );
      expect(relaunched.state.availableStartTime, '09:30');
      expect(relaunched.state.availableEndTime, '16:45');
      await relaunched.finish();

      expect(relaunched.state.complete, isTrue);
      expect(
        adapter.paths,
        containsAllInOrder([
          '/profiles/me',
          '/me/roles/activate',
          '/profiles/me',
          '/profiles/me/skills',
          '/profiles/me/worker',
          '/profiles/me/availability',
        ]),
      );
    },
  );
}

class _SuccessAdapter implements HttpClientAdapter {
  final paths = <String>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    paths.add(options.path);
    return ResponseBody.fromString(
      jsonEncode({
        'data': {'accepted': true, 'accessToken': 'worker-access-token'},
      }),
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}
