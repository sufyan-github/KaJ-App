/// Arguments passed to a route through GoRouter's `extra`, not its URL.
///
/// A job title and a counterparty's name are user-authored content. They used
/// to travel as query parameters purely so an app bar could render instantly,
/// which put them into navigation history, restored links and anything that
/// ever logs a route. `extra` keeps them in memory, and a cold deep link — the
/// one case with no `extra` — falls back to localized wording instead.
class ChatThreadArgs {
  const ChatThreadArgs({
    required this.jobTitle,
    required this.otherName,
    this.otherUserId,
  });

  final String jobTitle;
  final String otherName;
  final String? otherUserId;
}

class AttendanceArgs {
  const AttendanceArgs({required this.title, required this.isPoster});

  final bool isPoster;
  final String title;
}
