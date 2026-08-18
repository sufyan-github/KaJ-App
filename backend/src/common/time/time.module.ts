import { Global, Module } from "@nestjs/common";

import { CLOCK, SystemClock } from "./clock";

@Global()
@Module({
  exports: [CLOCK],
  providers: [SystemClock, { provide: CLOCK, useExisting: SystemClock }],
})
export class TimeModule {}
