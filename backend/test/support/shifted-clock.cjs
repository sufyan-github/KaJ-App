// Jest setup file: moves the JS clock forward by TEST_CLOCK_OFFSET_DAYS.
// CI runs the unit suites this way so a spec that only passes before some
// hard-coded date (a "time bomb") fails now, not on that date.
const days = Number(process.env.TEST_CLOCK_OFFSET_DAYS || 0);
if (days) {
  const offset = days * 86_400_000;
  const RealDate = Date;
  class ShiftedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(RealDate.now() + offset);
      else super(...args);
    }
    static now() {
      return RealDate.now() + offset;
    }
  }
  globalThis.Date = ShiftedDate;
}
