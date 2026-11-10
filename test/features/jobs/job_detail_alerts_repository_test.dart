import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/errors/failure.dart';
import 'package:kaaj/core/localization/kaaj_localizations.dart';
import 'package:kaaj/features/jobs/data/jobs_repository.dart';
import 'package:kaaj/features/jobs/domain/job_alert_errors.dart';

import '../../support/fake_api.dart';

Map<String, dynamic> jobDetailJson({
  String? viewerApplicationStatus,
  bool viewerIsPoster = false,
  String status = 'APPLICATIONS_OPEN',
}) => {
  'id': 'job-1',
  'title': 'Kitchen deep clean',
  'description': 'Two hours of kitchen cleaning.',
  'status': status,
  'category': {'id': 'cat-1', 'name_bn': 'পরিষ্কার', 'name_en': 'Cleaning'},
  'subcategory': {'id': 'sub-1', 'name_bn': 'রান্নাঘর', 'name_en': 'Kitchen'},
  'location': {'id': 'loc-1', 'name_bn': 'বোয়ালিয়া', 'name_en': 'Boalia'},
  'skills': [
    {
      'skill': {
        'id': 'skill-1',
        'name_bn': 'ঘর পরিষ্কার',
        'name_en': 'House cleaning',
      },
    },
  ],
  'starts_at': '2026-11-12T04:00:00.000Z',
  'ends_at': '2026-11-12T06:00:00.000Z',
  'budget_min_poisha': '50000',
  'budget_max_poisha': '80000',
  'poster': {
    'id': 'poster-1',
    'displayName': 'Nasrin A.',
    'trustLevel': 'IDENTITY',
    'badges': ['verified', 'reliable'],
  },
  'viewerApplicationStatus': viewerApplicationStatus,
  'viewerIsPoster': viewerIsPoster,
};

Map<String, dynamic> alertJson({String id = 'alert-1'}) => {
  'id': id,
  'categoryId': 'cat-1',
  'skillId': null,
  'locationId': 'loc-1',
  'labelEn': 'Cleaning · Boalia',
  'labelBn': 'পরিষ্কার · বোয়ালিয়া',
  'createdAt': '2026-11-10T08:00:00.000Z',
};

void main() {
  late FakeApi api;
  late JobsRepository repository;

  setUp(() {
    api = FakeApi();
    repository = JobsRepository(api.dio());
  });

  test('loads a job with poster and viewer state', () async {
    api.on(
      'GET /jobs/job-1',
      FakeResponse.data(jobDetailJson(viewerApplicationStatus: 'PENDING')),
    );

    final detail = await repository.getJob('job-1');

    expect(detail.job.title, 'Kitchen deep clean');
    expect(detail.job.skillsFor('en'), ['House cleaning']);
    expect(detail.subcategoryNameFor('en'), 'Kitchen');
    expect(detail.poster!.displayName, 'Nasrin A.');
    expect(detail.poster!.trustLevel, 'IDENTITY');
    expect(detail.poster!.badges, ['verified', 'reliable']);
    expect(detail.viewerApplicationStatus, 'PENDING');
    expect(detail.hasApplied, isTrue);
    expect(detail.viewerIsPoster, isFalse);
    expect(detail.isOpen, isTrue);
  });

  test('lists, creates and deletes job alerts', () async {
    api
      ..on(
        'GET /me/job-alerts',
        FakeResponse.data({
          'items': [alertJson()],
        }),
      )
      ..on(
        'POST /me/job-alerts',
        FakeResponse.data(alertJson(id: 'alert-2'), status: 201),
      )
      ..on('DELETE /me/job-alerts/alert-1', const FakeResponse(204));

    final alerts = await repository.jobAlerts();
    expect(alerts.single.labelFor('bn'), 'পরিষ্কার · বোয়ালিয়া');
    expect(alerts.single.labelFor('en'), 'Cleaning · Boalia');
    expect(alerts.single.locationId, 'loc-1');

    final created = await repository.createJobAlert(skillId: 'skill-1');
    expect(created.id, 'alert-2');
    expect(api.called('POST /me/job-alerts').single.data, {
      'skillId': 'skill-1',
    });

    await repository.deleteJobAlert('alert-1');
    expect(api.called('DELETE /me/job-alerts/alert-1'), hasLength(1));
  });

  for (final (code, english) in [
    (
      'JOB_ALERT_LIMIT',
      'You can keep up to 10 job alerts. Delete one to add a new one.',
    ),
    ('JOB_ALERT_DUPLICATE', 'You already have an alert for these jobs.'),
  ]) {
    test('$code maps to a user-facing message', () async {
      api.on('POST /me/job-alerts', FakeResponse.error(409, code));

      Object? caught;
      try {
        await repository.createJobAlert(categoryId: 'cat-1');
      } on Object catch (error) {
        caught = error;
      }

      expect(caught, isA<Failure>().having((f) => f.code, 'code', code));
      final message = jobAlertFailureMessage(caught!);
      expect(KaajLocalizations.forLanguage('en', message), english);
    });
  }
}
