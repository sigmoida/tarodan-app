import { formatNotificationDeadline } from "./notification-deadline";

describe("formatNotificationDeadline", () => {
  it("Türkiye saatiyle gg.aa.yyyy SS:dd yazar (UTC+3)", () => {
    expect(
      formatNotificationDeadline(new Date("2026-10-05T12:30:00.000Z")),
    ).toBe("05.10.2026 15:30");
  });

  it("gece yarısını aşan UTC anı ertesi Türkiye gününe düşer", () => {
    expect(
      formatNotificationDeadline(new Date("2026-12-31T22:15:00.000Z")),
    ).toBe("01.01.2027 01:15");
  });
});
