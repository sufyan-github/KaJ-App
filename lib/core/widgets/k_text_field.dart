import 'package:flutter/material.dart';

import '../localization/kaaj_localizations.dart';

class KTextField extends StatelessWidget {
  const KTextField({
    required this.label,
    this.controller,
    this.enabled = true,
    this.errorText,
    this.helperText,
    this.hintText,
    this.keyboardType,
    this.maxLines = 1,
    this.minLines,
    this.onChanged,
    this.prefixIcon,
    this.textInputAction,
    this.validator,
    super.key,
  });

  final String label;
  final TextEditingController? controller;
  final bool enabled;
  final String? errorText;
  final String? helperText;
  final String? hintText;
  final TextInputType? keyboardType;
  final int? maxLines;
  final int? minLines;
  final ValueChanged<String>? onChanged;
  final IconData? prefixIcon;
  final TextInputAction? textInputAction;
  final FormFieldValidator<String>? validator;

  @override
  Widget build(BuildContext context) {
    final localizedLabel = KaajLocalizations.text(context, label);
    return Semantics(
      textField: true,
      label: localizedLabel,
      child: TextFormField(
        controller: controller,
        enabled: enabled,
        keyboardType: keyboardType,
        maxLines: maxLines,
        minLines: minLines,
        textInputAction: textInputAction,
        onChanged: onChanged,
        validator: validator,
        decoration: InputDecoration(
          labelText: localizedLabel,
          hintText: hintText == null
              ? null
              : KaajLocalizations.text(context, hintText!),
          helperText: helperText == null
              ? null
              : KaajLocalizations.text(context, helperText!),
          errorText: errorText == null
              ? null
              : KaajLocalizations.text(context, errorText!),
          prefixIcon: prefixIcon == null ? null : Icon(prefixIcon),
        ),
      ),
    );
  }
}
