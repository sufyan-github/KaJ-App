import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/features/business/data/business_repository.dart';
import 'package:kaaj/features/business/domain/business_models.dart';

import '../support/fake_api.dart';

void main() {
  test('business and collaboration json tolerate nulls and extras', () {
    final business = Business.fromJson({
      'id': 'b1',
      'name': 'Rahim Agro',
      'stage': 'REGISTERED',
      'stageLabel': {'en': 'Registered', 'bn': 'নিবন্ধিত'},
      'category': null,
      'area': {'id': 'a1', 'nameEn': 'Boalia', 'nameBn': 'বোয়ালিয়া'},
      'verified': true,
      'myRole': 'MANAGER',
      'status': 'SUSPENDED',
      'somethingNew': 42,
    });
    expect(business.stage, BusinessStage.registered);
    expect(business.category, isNull);
    expect(business.area?.nameFor('en'), 'Boalia');
    expect(business.canEdit, isTrue);
    expect(business.isOwner, isFalse);
    expect(business.isSuspended, isTrue);

    final job = BusinessJob.fromJson({
      'id': 'j1',
      'title': 'Packer',
      'status': 'OPEN',
      'category': {'id': 'c1', 'name_en': 'Farming', 'name_bn': 'কৃষি'},
      'budgetMinPoisha': '50000',
    });
    expect(job.category?.nameFor('en'), 'Farming');
    expect(job.budgetMin?.poisha, 50000);

    final request = Collaboration.fromJson({
      'id': 'c1',
      'status': 'ACCEPTED',
      'role': 'RECIPIENT',
      'subject': {'type': 'IDEA', 'id': 'i1', 'title': 'Solar dryer'},
      'requester': {'userId': 'u2', 'displayName': 'K***'},
      'recipient': null,
      'allowedActions': ['AGREE', 'WITHDRAW', 'DANCE'],
      'history': [
        {'fromStatus': null, 'toStatus': 'PROPOSED', 'by': 'THEM'},
      ],
    });
    expect(request.subject.isIdea, isTrue);
    expect(request.otherSide.displayName, 'K***');
    expect(request.allowedActions, [
      CollaborationAction.agree,
      CollaborationAction.withdraw,
    ]);
    expect(request.history.single.toStatus, 'PROPOSED');
  });

  test('partners send only the filters that are set', () async {
    final api = FakeApi()
      ..on(
        'GET /partners',
        FakeResponse.data({'items': <Object>[], 'nextCursor': 'next'}),
      );
    final page = await BusinessRepository(
      api.dio(),
    ).partners(const PartnerFilter(stage: BusinessStage.idea));
    expect(page.nextCursor, 'next');
    expect(api.called('GET /partners').single.query, {'stage': 'IDEA'});
  });
}
