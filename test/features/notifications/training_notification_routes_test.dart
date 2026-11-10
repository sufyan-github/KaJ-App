import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/features/notifications/domain/app_notification.dart';

AppNotification _notification(String type, Map<String, dynamic> payload) =>
    AppNotification.fromJson({
      'id': 'n-1',
      'type': type,
      'titleBn': 'নতুন কাজ',
      'createdAt': '2026-11-11T08:00:00.000Z',
      'payload': payload,
    });

void main() {
  test('a job alert match opens the job detail page', () {
    expect(
      _notification('JOB_ALERT_MATCH', {
        'route': '/jobs/job-1',
        'jobId': 'job-1',
      }).route,
      '/jobs/job-1',
    );
    expect(
      _notification('JOB_ALERT_MATCH', {'jobId': 'job-2'}).route,
      '/jobs/job-2',
    );
    expect(_notification('JOB_ALERT_MATCH', {}).group, NotificationGroup.work);
  });

  test('a new certificate opens the certificates screen', () {
    expect(
      _notification('TRAINING_CERTIFICATE_ISSUED', {}).route,
      '/training/certificates',
    );
  });
}
