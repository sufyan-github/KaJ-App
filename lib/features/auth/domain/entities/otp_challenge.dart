class OtpChallenge {
  const OtpChallenge({
    required this.id,
    required this.phone,
    required this.expiresInSeconds,
  });

  final String id;
  final String phone;
  final int expiresInSeconds;
}
