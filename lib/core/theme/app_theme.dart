import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// App-wide tokens measured from the approved 390 × 844 Kaaj UI reference.
abstract final class KColors {
  static const primary = Color(0xFF55C795);
  static const primaryLight = Color(0xFF86D9B4);
  static const primaryDark = Color(0xFF076943);
  static const onPrimary = Color(0xFF07150E);
  static const secondary = Color(0xFFFF9A45);
  static const softSecondary = Color(0xFF432914);
  static const success = Color(0xFF55C795);
  static const warning = Color(0xFFFF9A45);
  static const danger = Color(0xFFFF7A7A);
  static const info = Color(0xFF82B7FF);
  static const background = Color(0xFF111713);
  static const surface = Color(0xFF19211C);
  static const surfaceAlt = Color(0xFF203029);
  static const border = Color(0xFF34443A);
  static const textPrimary = Color(0xFFF3F6F3);
  static const textSecondary = Color(0xFFAEB9B2);
}

abstract final class KSpacing {
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 16.0;
  static const lg = 24.0;
  static const xl = 32.0;
  static const xxl = 48.0;
}

abstract final class KRadius {
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 12.0;
  static const lg = 16.0;
  static const pill = 999.0;
}

ThemeData buildAppTheme() {
  const scheme = ColorScheme.dark(
    primary: KColors.primary,
    onPrimary: KColors.onPrimary,
    primaryContainer: KColors.surfaceAlt,
    onPrimaryContainer: KColors.primaryLight,
    secondary: KColors.secondary,
    onSecondary: KColors.onPrimary,
    secondaryContainer: KColors.softSecondary,
    onSecondaryContainer: KColors.secondary,
    error: KColors.danger,
    onError: KColors.onPrimary,
    surface: KColors.surface,
    onSurface: KColors.textPrimary,
    outline: KColors.border,
    outlineVariant: KColors.border,
  );

  final base = ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    colorScheme: scheme,
    scaffoldBackgroundColor: KColors.background,
    fontFamily: 'HindSiliguri',
    visualDensity: VisualDensity.standard,
  );
  final textTheme = base.textTheme.apply(
    bodyColor: KColors.textPrimary,
    displayColor: KColors.textPrimary,
    fontFamily: 'HindSiliguri',
  );
  const border = BorderSide(color: KColors.border);
  const inputRadius = BorderRadius.all(Radius.circular(KRadius.md));

  return base.copyWith(
    scaffoldBackgroundColor: KColors.background,
    canvasColor: KColors.background,
    splashColor: KColors.primary.withValues(alpha: .10),
    highlightColor: KColors.primary.withValues(alpha: .06),
    focusColor: KColors.primary.withValues(alpha: .12),
    textTheme: textTheme.copyWith(
      displayLarge: const TextStyle(
        fontSize: 30,
        height: 1.18,
        fontWeight: FontWeight.w600,
        letterSpacing: -.3,
      ),
      headlineSmall: const TextStyle(
        fontSize: 22,
        height: 1.24,
        fontWeight: FontWeight.w600,
      ),
      titleLarge: const TextStyle(
        fontSize: 21,
        height: 1.3,
        fontWeight: FontWeight.w600,
      ),
      titleMedium: const TextStyle(
        fontSize: 17,
        height: 1.35,
        fontWeight: FontWeight.w600,
      ),
      titleSmall: const TextStyle(
        fontSize: 14,
        height: 1.35,
        fontWeight: FontWeight.w600,
      ),
      bodyLarge: const TextStyle(fontSize: 16, height: 1.45),
      bodyMedium: const TextStyle(fontSize: 14, height: 1.45),
      bodySmall: const TextStyle(
        fontSize: 12,
        height: 1.4,
        color: KColors.textSecondary,
      ),
      labelLarge: const TextStyle(
        fontSize: 14,
        height: 1.25,
        fontWeight: FontWeight.w600,
      ),
      labelMedium: const TextStyle(
        fontSize: 12,
        height: 1.25,
        fontWeight: FontWeight.w500,
      ),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: KColors.background,
      foregroundColor: KColors.textPrimary,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: true,
      systemOverlayStyle: SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
        statusBarBrightness: Brightness.dark,
        systemNavigationBarColor: KColors.background,
        systemNavigationBarIconBrightness: Brightness.light,
      ),
      titleTextStyle: TextStyle(
        color: KColors.textPrimary,
        fontFamily: 'HindSiliguri',
        fontSize: 18,
        height: 1.25,
        fontWeight: FontWeight.w600,
      ),
    ),
    cardTheme: const CardThemeData(
      elevation: 0,
      color: KColors.surface,
      surfaceTintColor: Colors.transparent,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(KRadius.md)),
        side: border,
      ),
    ),
    dividerTheme: const DividerThemeData(
      color: KColors.border,
      thickness: 1,
      space: 1,
    ),
    inputDecorationTheme: const InputDecorationTheme(
      filled: true,
      fillColor: KColors.surface,
      labelStyle: TextStyle(color: KColors.textSecondary),
      floatingLabelStyle: TextStyle(
        color: KColors.primary,
        fontWeight: FontWeight.w500,
      ),
      hintStyle: TextStyle(color: KColors.textSecondary),
      helperStyle: TextStyle(color: KColors.textSecondary),
      errorStyle: TextStyle(color: KColors.danger, height: 1.25),
      prefixIconColor: KColors.textSecondary,
      suffixIconColor: KColors.textSecondary,
      iconColor: KColors.textSecondary,
      border: OutlineInputBorder(borderRadius: inputRadius, borderSide: border),
      enabledBorder: OutlineInputBorder(
        borderRadius: inputRadius,
        borderSide: border,
      ),
      disabledBorder: OutlineInputBorder(
        borderRadius: inputRadius,
        borderSide: border,
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: inputRadius,
        borderSide: BorderSide(color: KColors.primary, width: 1.5),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: inputRadius,
        borderSide: BorderSide(color: KColors.danger),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: inputRadius,
        borderSide: BorderSide(color: KColors.danger, width: 1.5),
      ),
      contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 14),
    ),
    textSelectionTheme: const TextSelectionThemeData(
      cursorColor: KColors.primary,
      selectionColor: Color(0x6655C795),
      selectionHandleColor: KColors.primary,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: KColors.primary,
        foregroundColor: KColors.onPrimary,
        disabledBackgroundColor: KColors.border,
        disabledForegroundColor: KColors.textSecondary,
        minimumSize: const Size.fromHeight(48),
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(KRadius.md),
        ),
        textStyle: const TextStyle(
          fontFamily: 'HindSiliguri',
          fontSize: 14,
          fontWeight: FontWeight.w600,
        ),
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        elevation: 0,
        backgroundColor: KColors.primary,
        foregroundColor: KColors.onPrimary,
        disabledBackgroundColor: KColors.border,
        disabledForegroundColor: KColors.textSecondary,
        minimumSize: const Size.fromHeight(48),
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(KRadius.md),
        ),
        textStyle: const TextStyle(
          fontFamily: 'HindSiliguri',
          fontSize: 14,
          fontWeight: FontWeight.w600,
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: KColors.primary,
        minimumSize: const Size.fromHeight(46),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
        side: const BorderSide(color: KColors.primary),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(KRadius.md),
        ),
        textStyle: const TextStyle(
          fontFamily: 'HindSiliguri',
          fontSize: 14,
          fontWeight: FontWeight.w600,
        ),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: KColors.primary,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(KRadius.sm),
        ),
        textStyle: const TextStyle(
          fontFamily: 'HindSiliguri',
          fontWeight: FontWeight.w600,
        ),
      ),
    ),
    iconButtonTheme: IconButtonThemeData(
      style: IconButton.styleFrom(
        foregroundColor: KColors.textPrimary,
        highlightColor: KColors.primary.withValues(alpha: .10),
      ),
    ),
    floatingActionButtonTheme: const FloatingActionButtonThemeData(
      elevation: 2,
      backgroundColor: KColors.primary,
      foregroundColor: KColors.onPrimary,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(KRadius.lg)),
      ),
    ),
    chipTheme: base.chipTheme.copyWith(
      backgroundColor: KColors.surfaceAlt,
      selectedColor: KColors.primary,
      secondarySelectedColor: KColors.primary,
      disabledColor: KColors.border,
      labelStyle: const TextStyle(color: KColors.textPrimary),
      secondaryLabelStyle: const TextStyle(color: KColors.onPrimary),
      side: const BorderSide(color: KColors.border),
      shape: const StadiumBorder(),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      showCheckmark: true,
      checkmarkColor: KColors.onPrimary,
    ),
    listTileTheme: const ListTileThemeData(
      iconColor: KColors.primary,
      textColor: KColors.textPrimary,
      contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 2),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(KRadius.md)),
      ),
      titleTextStyle: TextStyle(
        color: KColors.textPrimary,
        fontFamily: 'HindSiliguri',
        fontSize: 15,
        fontWeight: FontWeight.w600,
      ),
      subtitleTextStyle: TextStyle(
        color: KColors.textSecondary,
        fontFamily: 'HindSiliguri',
        fontSize: 13,
        height: 1.35,
      ),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: KColors.surface,
      surfaceTintColor: Colors.transparent,
      modalBackgroundColor: KColors.surface,
      modalBarrierColor: Color(0xB3111713),
      showDragHandle: true,
      dragHandleColor: KColors.border,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
    ),
    dialogTheme: const DialogThemeData(
      elevation: 8,
      backgroundColor: KColors.surface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(KRadius.lg)),
        side: border,
      ),
    ),
    snackBarTheme: const SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: KColors.surfaceAlt,
      contentTextStyle: TextStyle(
        color: KColors.textPrimary,
        fontFamily: 'HindSiliguri',
      ),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(KRadius.md)),
        side: border,
      ),
    ),
    navigationBarTheme: const NavigationBarThemeData(
      height: 64,
      elevation: 0,
      backgroundColor: KColors.surface,
      indicatorColor: KColors.surfaceAlt,
      labelBehavior: NavigationDestinationLabelBehavior.alwaysHide,
      iconTheme: WidgetStatePropertyAll(
        IconThemeData(color: KColors.textSecondary, size: 23),
      ),
    ),
    checkboxTheme: CheckboxThemeData(
      fillColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected)
            ? KColors.primary
            : Colors.transparent,
      ),
      checkColor: const WidgetStatePropertyAll(KColors.onPrimary),
      side: const BorderSide(color: KColors.border, width: 1.5),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(KRadius.xs),
      ),
    ),
    radioTheme: const RadioThemeData(
      fillColor: WidgetStatePropertyAll(KColors.primary),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected)
            ? KColors.onPrimary
            : KColors.textSecondary,
      ),
      trackColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected)
            ? KColors.primary
            : KColors.border,
      ),
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(
      color: KColors.primary,
      linearTrackColor: KColors.border,
      circularTrackColor: KColors.border,
    ),
  );
}
