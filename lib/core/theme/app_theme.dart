import 'package:flutter/material.dart';

abstract final class KColors {
  static const primary = Color(0xFF0F6B4A);
  static const primaryLight = Color(0xFF2E9B74);
  static const primaryDark = Color(0xFF084430);
  static const secondary = Color(0xFFD98324);
  static const success = Color(0xFF1B8A3D);
  static const warning = Color(0xFFC77700);
  static const danger = Color(0xFFC42E2E);
  static const info = Color(0xFF1A5FA8);
  static const background = Color(0xFFFAFAF8);
  static const surfaceAlt = Color(0xFFF2F2EE);
  static const border = Color(0xFFE0E0DA);
  static const textPrimary = Color(0xFF1A1A17);
  static const textSecondary = Color(0xFF5C5C55);
}

abstract final class KSpacing {
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 16.0;
  static const lg = 24.0;
  static const xl = 32.0;
  static const xxl = 48.0;
}

ThemeData buildAppTheme() {
  const scheme = ColorScheme.light(
    primary: KColors.primary,
    onPrimary: Colors.white,
    secondary: KColors.secondary,
    onSecondary: Color(0xFF241300),
    error: KColors.danger,
    onError: Colors.white,
    surface: Colors.white,
    onSurface: KColors.textPrimary,
  );

  final base = ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: KColors.background,
    fontFamily: 'Roboto',
  );
  final readableTextTheme = base.textTheme.apply(
    bodyColor: KColors.textPrimary,
    displayColor: KColors.textPrimary,
  );

  return base.copyWith(
    textTheme: readableTextTheme.copyWith(
      displayLarge: const TextStyle(
        fontSize: 32,
        height: 1.5,
        fontWeight: FontWeight.w700,
        color: KColors.textPrimary,
      ),
      titleLarge: const TextStyle(
        fontSize: 22,
        height: 1.5,
        fontWeight: FontWeight.w600,
        color: KColors.textPrimary,
      ),
      titleMedium: const TextStyle(
        fontSize: 18,
        height: 1.5,
        fontWeight: FontWeight.w600,
        color: KColors.textPrimary,
      ),
      bodyLarge: const TextStyle(
        fontSize: 16,
        height: 1.6,
        color: KColors.textPrimary,
      ),
      bodyMedium: const TextStyle(
        fontSize: 14,
        height: 1.6,
        color: KColors.textPrimary,
      ),
      labelLarge: const TextStyle(
        fontSize: 13,
        height: 1.5,
        fontWeight: FontWeight.w600,
        color: KColors.textPrimary,
      ),
    ),
    textSelectionTheme: const TextSelectionThemeData(
      cursorColor: KColors.primary,
      selectionColor: Color(0x332E9B74),
      selectionHandleColor: KColors.primary,
    ),
    inputDecorationTheme: const InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      labelStyle: TextStyle(color: KColors.textSecondary),
      floatingLabelStyle: TextStyle(color: KColors.primary),
      hintStyle: TextStyle(color: KColors.textSecondary),
      helperStyle: TextStyle(color: KColors.textSecondary),
      errorStyle: TextStyle(color: KColors.danger),
      prefixIconColor: KColors.textSecondary,
      suffixIconColor: KColors.textSecondary,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.all(Radius.circular(12)),
        borderSide: BorderSide(color: KColors.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.all(Radius.circular(12)),
        borderSide: BorderSide(color: KColors.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.all(Radius.circular(12)),
        borderSide: BorderSide(color: KColors.primary, width: 2),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.all(Radius.circular(12)),
        borderSide: BorderSide(color: KColors.danger),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.all(Radius.circular(12)),
        borderSide: BorderSide(color: KColors.danger, width: 2),
      ),
      contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 16),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
  );
}
