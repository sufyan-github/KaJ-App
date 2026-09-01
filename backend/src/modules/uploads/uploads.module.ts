import { Module } from "@nestjs/common";

import { ImageProcessor } from "./image.processor";
import { UploadsController } from "./uploads.controller";
import { UploadsService } from "./uploads.service";

@Module({
  controllers: [UploadsController],
  providers: [ImageProcessor, UploadsService],
})
export class UploadsModule {}
