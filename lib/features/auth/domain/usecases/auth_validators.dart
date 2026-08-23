abstract final class AuthValidators {
  static final RegExp _bangladeshPhone = RegExp(r'^(?:\+?880|0)?1[3-9]\d{8}$');
  static final RegExp _otp = RegExp(r'^\d{6}$');

  static String normalizePhone(String input) {
    final compact = input.replaceAll(RegExp(r'[\s\-()]'), '');
    if (compact.startsWith('+880')) return compact;
    if (compact.startsWith('880')) return '+$compact';
    if (compact.startsWith('0')) return '+88$compact';
    return '+880$compact';
  }

  static bool isValidPhone(String input) {
    final compact = input.replaceAll(RegExp(r'[\s\-()]'), '');
    return _bangladeshPhone.hasMatch(compact);
  }

  static bool isValidOtp(String input) => _otp.hasMatch(input.trim());
}
