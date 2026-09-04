import 'package:permission_handler/permission_handler.dart';

enum KPermission { camera, location, notifications, photos }

enum KPermissionStatus { granted, denied, permanentlyDenied, restricted }

class PermissionGateway {
  const PermissionGateway();

  Future<KPermissionStatus> status(KPermission permission) async =>
      _mapStatus(await _platformPermission(permission).status);

  Future<KPermissionStatus> request(KPermission permission) async {
    return _mapStatus(await _platformPermission(permission).request());
  }

  KPermissionStatus _mapStatus(PermissionStatus status) {
    if (status.isGranted || status.isLimited) return KPermissionStatus.granted;
    if (status.isPermanentlyDenied) {
      return KPermissionStatus.permanentlyDenied;
    }
    if (status.isRestricted) return KPermissionStatus.restricted;
    return KPermissionStatus.denied;
  }

  Future<bool> openSettings() => openAppSettings();

  Permission _platformPermission(KPermission permission) =>
      switch (permission) {
        KPermission.camera => Permission.camera,
        KPermission.location => Permission.locationWhenInUse,
        KPermission.notifications => Permission.notification,
        KPermission.photos => Permission.photos,
      };
}
