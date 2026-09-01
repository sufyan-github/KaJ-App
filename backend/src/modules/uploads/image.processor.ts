import { Injectable } from "@nestjs/common";
import sharp from "sharp";

export interface ProcessedImage {
  detectedMime: "image/jpeg" | "image/png" | "image/webp";
  height: number;
  sanitized: Buffer;
  width: number;
  variants: Array<{
    body: Buffer;
    name: "small" | "medium" | "large";
  }>;
}

@Injectable()
export class ImageProcessor {
  async inspectAndProcess(body: Uint8Array): Promise<ProcessedImage> {
    const source = sharp(body, {
      failOn: "warning",
      limitInputPixels: 40_000_000,
    });
    const metadata = await source.metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      !["jpeg", "png", "webp"].includes(metadata.format)
    ) {
      throw new Error("Uploaded image content is invalid or unsupported.");
    }
    const sizes = [
      { name: "small" as const, width: 256 },
      { name: "medium" as const, width: 768 },
      { name: "large" as const, width: 1_440 },
    ];
    const variants = await Promise.all(
      sizes.map(async ({ name, width }) => ({
        body: await sharp(body)
          .rotate()
          .resize({
            width,
            height: width,
            fit: "cover",
            withoutEnlargement: true,
          })
          .webp({ quality: 82 })
          .toBuffer(),
        name,
      })),
    );
    const sanitized = await sharp(body)
      .rotate()
      .webp({ quality: 90 })
      .toBuffer();
    const detectedMime: ProcessedImage["detectedMime"] =
      metadata.format === "jpeg"
        ? "image/jpeg"
        : metadata.format === "png"
          ? "image/png"
          : "image/webp";
    return {
      detectedMime,
      height: metadata.height,
      sanitized,
      width: metadata.width,
      variants,
    };
  }
}
