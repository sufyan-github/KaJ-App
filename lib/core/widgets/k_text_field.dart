import 'package:flutter/material.dart';

class KTextField extends StatelessWidget {
  const KTextField({
    required this.label,
    this.controller,
    this.enabled = true,
    this.errorText,
    this.helperText,
    this.hintText,
    this.keyboardType,
    this.onChanged,
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
  final ValueChanged<String>? onChanged;
  final FormFieldValidator<String>? validator;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      textField: true,
      label: label,
      child: TextFormField(
        controller: controller,
        enabled: enabled,
        keyboardType: keyboardType,
        onChanged: onChanged,
        validator: validator,
        decoration: InputDecoration(
          labelText: label,
          hintText: hintText,
          helperText: helperText,
          errorText: errorText,
        ),
      ),
    );
  }
}
