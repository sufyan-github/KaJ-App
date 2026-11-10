import '../../../core/errors/failure.dart';

/// Bangla source copy for a job alert request that did not go through. The
/// screens render it through the translation catalog.
String jobAlertFailureMessage(Object error) {
  final failure = error is Failure ? error : null;
  return switch (failure?.code) {
    'JOB_ALERT_LIMIT' =>
      'সর্বোচ্চ ১০টি কাজের সতর্কতা রাখা যায়। একটি মুছে নতুনটি যোগ করুন।',
    'JOB_ALERT_DUPLICATE' => 'এই ধরনের কাজের সতর্কতা আগেই চালু আছে।',
    _ => switch (failure?.kind) {
      FailureKind.network || FailureKind.timeout =>
        'ইন্টারনেট সংযোগ নেই। সংযোগ ঠিক করে আবার চেষ্টা করুন।',
      _ => 'কাজের সতর্কতা সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।',
    },
  };
}
