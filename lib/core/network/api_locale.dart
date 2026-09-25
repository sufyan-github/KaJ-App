/// The language tag sent as `Accept-Language` on every API request.
///
/// This is deliberately a mutable holder rather than a constructor argument.
/// Rebuilding the Dio client whenever the user switches language would tear
/// down every provider beneath it — including the auth controller, which would
/// reset to [AuthStatus.initial] and bounce the user back to the splash screen.
/// The interceptor reads this on each request instead, so the header follows
/// the locale without the client ever being replaced.
class ApiLocale {
  ApiLocale([this._languageCode = 'bn']);

  String _languageCode;

  String get languageCode => _languageCode;

  set languageCode(String value) {
    if (value.isEmpty) return;
    _languageCode = value;
  }
}
