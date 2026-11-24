/**
 * Step pictures: the rules shown next to the upload and the checks the
 * console makes before uploading. The server checks the bytes again
 * (TRAINING_IMAGE_INVALID / TRAINING_IMAGE_TOO_LARGE).
 */

export const STEP_IMAGE_MAX_BYTES = 307_200; // 300 KB
export const STEP_IMAGE_MAX_PX = 1600;
export const STEP_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Shown next to the upload, in this order. */
export const STEP_IMAGE_RULES = [
  "Landscape (wider than tall).",
  `At most ${STEP_IMAGE_MAX_PX} px wide.`,
  "At most 300 KB (JPEG, PNG or WebP).",
  "One action per picture.",
  "No faces without the person's consent.",
] as const;

export type ImageCheck = { errors: string[]; warnings: string[] };

export function checkStepImage(file: {
  mime: string;
  sizeBytes: number;
  width?: number;
  height?: number;
}): ImageCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!STEP_IMAGE_TYPES.includes(file.mime))
    errors.push("Use a JPEG, PNG or WebP picture.");
  if (file.sizeBytes > STEP_IMAGE_MAX_BYTES)
    errors.push(
      `The picture is ${Math.ceil(file.sizeBytes / 1024)} KB; the limit is 300 KB.`,
    );
  if (file.width !== undefined && file.height !== undefined) {
    if (file.width > STEP_IMAGE_MAX_PX || file.height > STEP_IMAGE_MAX_PX)
      errors.push(
        `The picture is ${file.width}×${file.height} px; at most ${STEP_IMAGE_MAX_PX} px on each side.`,
      );
    if (file.width <= file.height)
      warnings.push("Use a landscape picture (wider than tall).");
  }
  return { errors, warnings };
}
