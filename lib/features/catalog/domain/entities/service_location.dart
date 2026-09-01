enum ServiceLocationType { city, thana, area }

class ServiceLocation {
  const ServiceLocation({
    required this.id,
    required this.type,
    required this.nameEn,
    required this.nameBn,
    this.parentId,
    this.latitude,
    this.longitude,
    this.radiusKm,
  });

  final String id;
  final double? latitude;
  final double? longitude;
  final String nameBn;
  final String nameEn;
  final String? parentId;
  final double? radiusKm;
  final ServiceLocationType type;
}
