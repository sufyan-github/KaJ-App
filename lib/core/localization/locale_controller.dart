import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_ce_flutter/hive_flutter.dart';

const localePreferencesBoxName = 'kaaj.preferences';

final localeControllerProvider =
    StateNotifierProvider<LocaleController, Locale>((ref) {
      final box = Hive.isBoxOpen(localePreferencesBoxName)
          ? Hive.box<dynamic>(localePreferencesBoxName)
          : null;
      return LocaleController(box);
    });

class LocaleController extends StateNotifier<Locale> {
  LocaleController(this._box) : super(_restore(_box));

  static const supportedLanguageCodes = {'bn', 'en'};
  static const _localeKey = 'app.locale';

  final Box<dynamic>? _box;

  Future<void> setLocale(Locale locale) async {
    final languageCode = supportedLanguageCodes.contains(locale.languageCode)
        ? locale.languageCode
        : 'bn';
    if (state.languageCode == languageCode) return;
    state = Locale(languageCode);
    await _box?.put(_localeKey, languageCode);
  }

  static Locale _restore(Box<dynamic>? box) {
    final saved = box?.get(_localeKey);
    return Locale(
      saved is String && supportedLanguageCodes.contains(saved) ? saved : 'bn',
    );
  }
}
