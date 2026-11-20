import '../../../core/formatting/money.dart';
import '../../../core/network/paged_list.dart';

// Defensive JSON readers: the backend is still changing, so every field
// tolerates null, a missing key or an unexpected type.

String _str(Object? value) => value is String ? value : '';

String? _strOrNull(Object? value) =>
    value is String && value.trim().isNotEmpty ? value : null;

int? _int(Object? value) => switch (value) {
  final num number => number.toInt(),
  final String text => int.tryParse(text),
  _ => null,
};

DateTime? _date(Object? value) =>
    value is String ? DateTime.tryParse(value) : null;

Map<String, dynamic>? _map(Object? value) =>
    value is Map ? Map<String, dynamic>.from(value) : null;

List<Map<String, dynamic>> _maps(Object? value) => value is List
    ? value
          .whereType<Map>()
          .map(Map<String, dynamic>.from)
          .toList(growable: false)
    : const [];

/// A Bangla and English pair sent by the server.
class BnEn {
  const BnEn({this.en = '', this.bn = ''});

  factory BnEn.fromJson(Object? json) {
    final map = _map(json);
    if (map == null) return const BnEn();
    return BnEn(en: _str(map['en']), bn: _str(map['bn']));
  }

  final String bn;
  final String en;

  bool get isEmpty => bn.isEmpty && en.isEmpty;

  String forLanguage(String languageCode) => languageCode == 'en'
      ? (en.isNotEmpty ? en : bn)
      : (bn.isNotEmpty ? bn : en);
}

enum BusinessStage {
  idea('IDEA'),
  informal('INFORMAL'),
  registered('REGISTERED');

  const BusinessStage(this.wire);
  final String wire;

  static BusinessStage parse(Object? value) => BusinessStage.values.firstWhere(
    (item) => item.wire == value,
    orElse: () => BusinessStage.informal,
  );
}

enum BusinessRole {
  owner('OWNER'),
  manager('MANAGER'),
  staff('STAFF');

  const BusinessRole(this.wire);
  final String wire;

  static BusinessRole? tryParse(Object? value) {
    for (final item in BusinessRole.values) {
      if (item.wire == value) return item;
    }
    return null;
  }

  bool get canEdit => this == owner || this == manager;
}

/// A named place or sector, with Bangla and English names.
class BusinessRef {
  const BusinessRef({
    required this.id,
    this.nameEn = '',
    this.nameBn = '',
    this.slug,
    this.parentId,
  });

  static BusinessRef? tryParse(Object? json) {
    final map = _map(json);
    if (map == null) return null;
    final id = _str(map['id']);
    if (id.isEmpty) return null;
    return BusinessRef(
      id: id,
      // Some job views still send the database names (name_en).
      nameEn: _str(map['nameEn'] ?? map['name_en']),
      nameBn: _str(map['nameBn'] ?? map['name_bn']),
      slug: _strOrNull(map['slug']),
      parentId: _strOrNull(map['parentId']),
    );
  }

  final String id;
  final String nameBn;
  final String nameEn;
  final String? parentId;
  final String? slug;

  String nameFor(String languageCode) => languageCode == 'en'
      ? (nameEn.isNotEmpty ? nameEn : nameBn)
      : (nameBn.isNotEmpty ? nameBn : nameEn);
}

class BusinessOwner {
  const BusinessOwner({
    required this.userId,
    required this.displayName,
    this.trustLevel,
  });

  final String displayName;
  final String? trustLevel;
  final String userId;
}

/// A business as `BusinessPublic`, plus the member-only fields of
/// `BusinessMemberView` when the viewer belongs to it.
class Business {
  const Business({
    required this.id,
    required this.name,
    this.stage = BusinessStage.informal,
    this.stageLabel = const BnEn(),
    this.description,
    this.category,
    this.area,
    this.employeesCount,
    this.isPublic = false,
    this.seekingPartners = false,
    this.verified = false,
    this.owner,
    this.createdAt,
    this.status,
    this.address,
    this.contactPerson,
    this.tradeLicenceNo,
    this.verificationStatus,
    this.myRole,
  });

  factory Business.fromJson(Map<String, dynamic> json) {
    final owner = _map(json['owner']);
    return Business(
      id: _str(json['id']),
      name: _str(json['name']),
      stage: BusinessStage.parse(json['stage']),
      stageLabel: BnEn.fromJson(json['stageLabel']),
      description: _strOrNull(json['description']),
      category: BusinessRef.tryParse(json['category']),
      area: BusinessRef.tryParse(json['area']),
      employeesCount: _int(json['employeesCount']),
      isPublic: json['isPublic'] == true,
      seekingPartners: json['seekingPartners'] == true,
      verified: json['verified'] == true,
      owner: owner == null
          ? null
          : BusinessOwner(
              userId: _str(owner['userId']),
              displayName: _str(owner['displayName']),
              trustLevel: _strOrNull(owner['trustLevel']),
            ),
      createdAt: _date(json['createdAt']),
      status: _strOrNull(json['status']),
      address: _strOrNull(json['address']),
      contactPerson: _strOrNull(json['contactPerson']),
      tradeLicenceNo: _strOrNull(json['tradeLicenceNo']),
      verificationStatus: _strOrNull(json['verificationStatus']),
      myRole: BusinessRole.tryParse(json['myRole']),
    );
  }

  final String? address;
  final BusinessRef? area;
  final BusinessRef? category;
  final String? contactPerson;
  final DateTime? createdAt;
  final String? description;
  final int? employeesCount;
  final String id;
  final bool isPublic;
  final BusinessRole? myRole;
  final String name;
  final BusinessOwner? owner;
  final bool seekingPartners;
  final BusinessStage stage;
  final BnEn stageLabel;

  /// ACTIVE or SUSPENDED; members only.
  final String? status;
  final String? tradeLicenceNo;
  final String? verificationStatus;
  final bool verified;

  bool get isMember => myRole != null;
  bool get isSuspended => status == 'SUSPENDED';
  bool get canEdit => myRole?.canEdit ?? false;
  bool get isOwner => myRole == BusinessRole.owner;
}

class BusinessInvitation {
  const BusinessInvitation({
    required this.business,
    required this.role,
    this.invitedAt,
  });

  final Business business;
  final BusinessRole? role;
  final DateTime? invitedAt;
}

class MyBusinesses {
  const MyBusinesses({this.items = const [], this.invitations = const []});

  factory MyBusinesses.fromJson(Map<String, dynamic> json) => MyBusinesses(
    items: _maps(
      json['items'],
    ).map(Business.fromJson).where((item) => item.id.isNotEmpty).toList(),
    invitations: [
      for (final item in _maps(json['invitations']))
        if (_map(item['business']) case final business?)
          BusinessInvitation(
            business: Business.fromJson(business),
            role: BusinessRole.tryParse(item['role']),
            invitedAt: _date(item['invitedAt']),
          ),
    ],
  );

  final List<BusinessInvitation> invitations;
  final List<Business> items;

  bool isInvitedTo(String businessId) =>
      invitations.any((item) => item.business.id == businessId);
}

class BusinessMember {
  const BusinessMember({
    required this.userId,
    required this.displayName,
    required this.role,
    required this.status,
    this.invitedAt,
    this.acceptedAt,
  });

  factory BusinessMember.fromJson(Map<String, dynamic> json) => BusinessMember(
    userId: _str(json['userId']),
    displayName: _str(json['displayName']),
    role: BusinessRole.tryParse(json['role']) ?? BusinessRole.staff,
    status: _str(json['status']),
    invitedAt: _date(json['invitedAt']),
    acceptedAt: _date(json['acceptedAt']),
  );

  final DateTime? acceptedAt;
  final String displayName;
  final DateTime? invitedAt;
  final BusinessRole role;

  /// ACTIVE or INVITED.
  final String status;
  final String userId;

  bool get isInvited => status == 'INVITED';
}

List<BusinessMember> businessMembersFrom(Object? data) => _maps(
  _map(data)?['items'] ?? data,
).map(BusinessMember.fromJson).where((item) => item.userId.isNotEmpty).toList();

enum OfferingKind {
  product('PRODUCT'),
  service('SERVICE');

  const OfferingKind(this.wire);
  final String wire;

  static OfferingKind parse(Object? value) =>
      value == 'SERVICE' ? service : product;
}

class Offering {
  const Offering({
    required this.id,
    required this.businessId,
    this.kind = OfferingKind.product,
    this.titleEn,
    this.titleBn,
    this.description,
    this.priceMin,
    this.priceMax,
    this.priceUnit,
    this.isActive = true,
    this.sortOrder,
    this.status,
    this.hiddenReason,
  });

  factory Offering.fromJson(Map<String, dynamic> json) => Offering(
    id: _str(json['id']),
    businessId: _str(json['businessId']),
    kind: OfferingKind.parse(json['kind']),
    titleEn: _strOrNull(json['titleEn']),
    titleBn: _strOrNull(json['titleBn']),
    description: _strOrNull(json['description']),
    priceMin: Money.tryParse(json['priceMinPoisha']),
    priceMax: Money.tryParse(json['priceMaxPoisha']),
    priceUnit: _strOrNull(json['priceUnit']),
    isActive: json['isActive'] != false,
    sortOrder: _int(json['sortOrder']),
    status: _strOrNull(json['status']),
    hiddenReason: _strOrNull(json['hiddenReason']),
  );

  final String businessId;
  final String? description;
  final String? hiddenReason;
  final String id;
  final bool isActive;
  final OfferingKind kind;
  final Money? priceMax;
  final Money? priceMin;
  final String? priceUnit;
  final int? sortOrder;

  /// ACTIVE, INACTIVE or HIDDEN (by moderation); members only.
  final String? status;
  final String? titleBn;
  final String? titleEn;

  bool get isHidden => status == 'HIDDEN';

  String titleFor(String languageCode) => languageCode == 'en'
      ? (titleEn ?? titleBn ?? '')
      : (titleBn ?? titleEn ?? '');
}

/// A job posted for the business (staff job).
class BusinessJob {
  const BusinessJob({
    required this.id,
    required this.title,
    required this.status,
    this.category,
    this.location,
    this.budgetMin,
    this.budgetMax,
    this.startsAt,
    this.publishedAt,
  });

  factory BusinessJob.fromJson(Map<String, dynamic> json) => BusinessJob(
    id: _str(json['id']),
    title: _str(json['title']),
    status: _str(json['status']),
    category: BusinessRef.tryParse(json['category']),
    location: BusinessRef.tryParse(json['location']),
    budgetMin: Money.tryParse(json['budgetMinPoisha']),
    budgetMax: Money.tryParse(json['budgetMaxPoisha']),
    startsAt: _date(json['startsAt']),
    publishedAt: _date(json['publishedAt']),
  );

  final Money? budgetMax;
  final Money? budgetMin;
  final BusinessRef? category;
  final String id;
  final BusinessRef? location;
  final DateTime? publishedAt;
  final DateTime? startsAt;
  final String status;
  final String title;
}

class BusinessVerificationRequest {
  const BusinessVerificationRequest({
    required this.status,
    this.rejectionReason,
    this.submittedAt,
    this.reviewedAt,
  });

  final String? rejectionReason;
  final DateTime? reviewedAt;
  final String status;
  final DateTime? submittedAt;
}

class BusinessVerification {
  const BusinessVerification({
    this.status = 'NOT_SUBMITTED',
    this.verified = false,
    this.canSubmit = false,
    this.latest,
  });

  factory BusinessVerification.fromJson(Map<String, dynamic> json) {
    final latest = _map(json['latestRequest']);
    return BusinessVerification(
      status: _strOrNull(json['verificationStatus']) ?? 'NOT_SUBMITTED',
      verified: json['verified'] == true,
      canSubmit: json['canSubmit'] == true,
      latest: latest == null
          ? null
          : BusinessVerificationRequest(
              status: _str(latest['status']),
              rejectionReason: _strOrNull(latest['rejectionReason']),
              submittedAt: _date(latest['submittedAt']),
              reviewedAt: _date(latest['reviewedAt']),
            ),
    );
  }

  final bool canSubmit;
  final BusinessVerificationRequest? latest;

  /// NOT_SUBMITTED, PENDING, APPROVED or REJECTED.
  final String status;
  final bool verified;
}

/// The filters of the partner directory.
class PartnerFilter {
  const PartnerFilter({this.categoryId, this.stage, this.locationId, this.q});

  final String? categoryId;
  final String? locationId;
  final String? q;
  final BusinessStage? stage;

  Map<String, dynamic> query({String? cursor}) => {
    'categoryId': ?categoryId,
    'stage': ?stage?.wire,
    'locationId': ?locationId,
    'q': ?q,
    'cursor': ?cursor,
  };

  @override
  bool operator ==(Object other) =>
      other is PartnerFilter &&
      other.categoryId == categoryId &&
      other.stage == stage &&
      other.locationId == locationId &&
      other.q == q;

  @override
  int get hashCode => Object.hash(categoryId, stage, locationId, q);
}

// ------------------------------------------------------------ collaboration

enum CollaborationAction {
  accept('ACCEPT', 'accept'),
  decline('DECLINE', 'decline'),
  withdraw('WITHDRAW', 'withdraw'),
  agree('AGREE', 'agree'),
  end('END', 'end');

  const CollaborationAction(this.wire, this.path);
  final String path;
  final String wire;

  static CollaborationAction? tryParse(Object? value) {
    for (final item in CollaborationAction.values) {
      if (item.wire == value) return item;
    }
    return null;
  }
}

class CollaborationPerson {
  const CollaborationPerson({required this.userId, required this.displayName});

  factory CollaborationPerson.fromJson(Object? json) {
    final map = _map(json) ?? const {};
    return CollaborationPerson(
      userId: _str(map['userId']),
      displayName: _str(map['displayName']),
    );
  }

  final String displayName;
  final String userId;
}

class CollaborationSubject {
  const CollaborationSubject({
    required this.type,
    required this.id,
    this.ideaRoleId,
    this.title,
    this.summary,
  });

  factory CollaborationSubject.fromJson(Object? json) {
    final map = _map(json) ?? const {};
    return CollaborationSubject(
      type: _str(map['type']),
      id: _str(map['id']),
      ideaRoleId: _strOrNull(map['ideaRoleId']),
      title: _strOrNull(map['title']),
      summary: _strOrNull(map['summary']),
    );
  }

  final String id;
  final String? ideaRoleId;
  final String? summary;
  final String? title;

  /// BUSINESS or IDEA.
  final String type;

  bool get isIdea => type == 'IDEA';
}

class CollaborationAgreement {
  const CollaborationAgreement({
    this.summary,
    this.agreedByMe = false,
    this.agreedByThem = false,
    this.agreedAt,
  });

  factory CollaborationAgreement.fromJson(Object? json) {
    final map = _map(json) ?? const {};
    return CollaborationAgreement(
      summary: _strOrNull(map['summary']),
      agreedByMe: map['agreedByMe'] == true,
      agreedByThem: map['agreedByThem'] == true,
      agreedAt: _date(map['agreedAt']),
    );
  }

  final DateTime? agreedAt;
  final bool agreedByMe;
  final bool agreedByThem;
  final String? summary;
}

class CollaborationEvent {
  const CollaborationEvent({
    required this.toStatus,
    required this.by,
    this.fromStatus,
    this.note,
    this.at,
  });

  final DateTime? at;

  /// ME, THEM or KAAJ.
  final String by;
  final String? fromStatus;
  final String? note;
  final String toStatus;
}

class Collaboration {
  const Collaboration({
    required this.id,
    required this.status,
    required this.role,
    required this.subject,
    required this.requester,
    required this.recipient,
    this.fromBusiness,
    this.message = '',
    this.conversationId,
    this.agreement = const CollaborationAgreement(),
    this.allowedActions = const [],
    this.createdAt,
    this.notice = const BnEn(),
    this.history = const [],
  });

  factory Collaboration.fromJson(Map<String, dynamic> json) {
    final from = _map(json['fromBusiness']);
    return Collaboration(
      id: _str(json['id']),
      status: _str(json['status']),
      role: _str(json['role']),
      subject: CollaborationSubject.fromJson(json['subject']),
      requester: CollaborationPerson.fromJson(json['requester']),
      recipient: CollaborationPerson.fromJson(json['recipient']),
      fromBusiness: from == null
          ? null
          : (id: _str(from['id']), name: _str(from['name'])),
      message: _str(json['message']),
      conversationId: _strOrNull(json['conversationId']),
      agreement: CollaborationAgreement.fromJson(json['agreement']),
      allowedActions: [
        if (json['allowedActions'] case final List actions)
          for (final action in actions) ?CollaborationAction.tryParse(action),
      ],
      createdAt: _date(json['createdAt']),
      notice: BnEn.fromJson(json['notice']),
      history: [
        for (final event in _maps(json['history']))
          CollaborationEvent(
            fromStatus: _strOrNull(event['fromStatus']),
            toStatus: _str(event['toStatus']),
            by: _str(event['by']),
            note: _strOrNull(event['note']),
            at: _date(event['at']),
          ),
      ],
    );
  }

  final CollaborationAgreement agreement;
  final List<CollaborationAction> allowedActions;
  final String? conversationId;
  final DateTime? createdAt;
  final ({String id, String name})? fromBusiness;
  final List<CollaborationEvent> history;
  final String id;
  final String message;
  final BnEn notice;
  final CollaborationPerson recipient;
  final CollaborationPerson requester;

  /// REQUESTER or RECIPIENT.
  final String role;

  /// PROPOSED, ACCEPTED, DECLINED, WITHDRAWN, AGREED or ENDED.
  final String status;
  final CollaborationSubject subject;

  bool get iAmRequester => role == 'REQUESTER';

  CollaborationPerson get otherSide => iAmRequester ? recipient : requester;
}

/// One page of collaboration requests with the notice the server sends.
class CollaborationPage {
  const CollaborationPage({required this.items, this.notice = const BnEn()});

  final PagedList<Collaboration> items;
  final BnEn notice;
}
