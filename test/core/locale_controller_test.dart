import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive_ce_flutter/hive_flutter.dart';
import 'package:kaaj/core/localization/locale_controller.dart';

void main() {
  test('selected locale survives a preferences box reopen', () async {
    final directory = await Directory.systemTemp.createTemp('kaaj-locale-');
    addTearDown(() async {
      await Hive.close();
      if (directory.existsSync()) await directory.delete(recursive: true);
    });
    Hive.init(directory.path);
    var box = await Hive.openBox<dynamic>(localePreferencesBoxName);
    final controller = LocaleController(box);

    expect(controller.state, const Locale('bn'));
    await controller.setLocale(const Locale('en'));
    await box.close();
    box = await Hive.openBox<dynamic>(localePreferencesBoxName);

    expect(LocaleController(box).state, const Locale('en'));
  });
}
