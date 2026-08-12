import { describe, expect, it } from "vitest";
import {
  getRunEventChannel,
  parseRunEventNotification,
  serializeRunEventNotification,
} from "../src/realtime.js";

describe("run event realtime contract", () => {
  it("creates a per-run Redis channel", () => {
    expect(getRunEventChannel("run-123")).toBe("cascade:realtime:run:run-123");
  });

  it("serializes and parses an event notification", () => {
    const value = serializeRunEventNotification({
      eventId: "33333333-3333-4333-8333-333333333333",
    });

    expect(value).toBe('{"eventId":"33333333-3333-4333-8333-333333333333"}');

    expect(parseRunEventNotification(value)).toEqual({
      eventId: "33333333-3333-4333-8333-333333333333",
    });
  });

  it.each([
    "",
    "not-json",
    "null",
    "[]",
    "{}",
    '{"eventId":123}',
    '{"eventId":"event-1","extra":true}',
  ])("rejects invalid notification payload %j", (value) => {
    expect(parseRunEventNotification(value)).toBeNull();
  });
});
