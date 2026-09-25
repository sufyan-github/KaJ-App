/// An amount of Bangladeshi currency, held as an integer number of poisha.
///
/// The API sends money as a decimal string, and it used to be carried through
/// the app that way and parsed at the point of display with
/// `int.tryParse(value) ?? 0` — so a malformed amount rendered as ৳0.00 rather
/// than surfacing as an error, and the same conversion was duplicated in two
/// files with different signatures. Parsing once, at the data boundary, means
/// "no amount" and "zero" stop looking identical.
class Money implements Comparable<Money> {
  const Money(this.poisha);

  /// Parses an API amount. Returns null when the field is absent or unusable,
  /// so callers can distinguish a missing price from a free job.
  static Money? tryParse(Object? value) {
    if (value == null) return null;
    if (value is int) return Money(value);
    if (value is num) return Money(value.round());
    final text = value.toString().trim();
    if (text.isEmpty) return null;
    final parsed = int.tryParse(text);
    if (parsed != null) return Money(parsed);
    // Tolerate "120000.00" from a decimal-typed backend column.
    final asDouble = double.tryParse(text);
    return asDouble == null ? null : Money(asDouble.round());
  }

  /// For required fields. Falls back to zero but keeps the call site honest
  /// about the fact that a default was applied.
  static Money parseOrZero(Object? value) => tryParse(value) ?? zero;

  static const zero = Money(0);

  final int poisha;

  int get wholeTaka => poisha ~/ 100;

  int get fractionalPoisha => poisha.remainder(100).abs();

  bool get isZero => poisha == 0;

  /// The wire format the API expects back.
  String toWire() => poisha.toString();

  Money operator +(Money other) => Money(poisha + other.poisha);

  Money operator -(Money other) => Money(poisha - other.poisha);

  @override
  int compareTo(Money other) => poisha.compareTo(other.poisha);

  @override
  bool operator ==(Object other) => other is Money && other.poisha == poisha;

  @override
  int get hashCode => poisha.hashCode;

  @override
  String toString() => 'Money($poisha poisha)';
}
