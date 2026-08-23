import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/features/auth/domain/usecases/auth_validators.dart';

void main() {
  group('AuthValidators', () {
    test('accepts supported Bangladeshi phone formats', () {
      expect(AuthValidators.isValidPhone('01712345678'), isTrue);
      expect(AuthValidators.isValidPhone('+8801712345678'), isTrue);
      expect(AuthValidators.isValidPhone('8801712345678'), isTrue);
    });

    test('rejects incomplete or impossible operator prefixes', () {
      expect(AuthValidators.isValidPhone('017123'), isFalse);
      expect(AuthValidators.isValidPhone('01112345678'), isFalse);
      expect(AuthValidators.isValidPhone('text'), isFalse);
    });

    test('normalizes local phone numbers to E.164', () {
      expect(AuthValidators.normalizePhone('01712-345678'), '+8801712345678');
    });

    test('accepts exactly six numeric OTP digits', () {
      expect(AuthValidators.isValidOtp('123456'), isTrue);
      expect(AuthValidators.isValidOtp('12345'), isFalse);
      expect(AuthValidators.isValidOtp('12345a'), isFalse);
    });
  });
}
