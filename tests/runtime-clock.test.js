import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_RUNTIME_TIME_ZONE,
  runtimeClockInstruction,
  runtimeClockSnapshot,
} from "../worker/runtime-clock.js";

test("runtime clock uses America/Denver and the real execution date, not project context", () => {
  // 2026-09-23 06:32:45Z is 00:32:45 MDT in America/Denver.
  const snapshot = runtimeClockSnapshot(new Date("2026-09-23T06:32:45.000Z"));

  assert.equal(DEFAULT_RUNTIME_TIME_ZONE, "America/Denver");
  assert.equal(snapshot.date, "2026-09-23");
  assert.equal(snapshot.time, "00:32:45");
  assert.equal(snapshot.timeZone, "America/Denver");
  assert.equal(snapshot.zoneAbbreviation, "MDT");
  assert.equal(snapshot.generatedAtUtc, "2026-09-23T06:32:45.000Z");
});

test("runtime clock is DST-aware", () => {
  // Same UTC hour maps differently after Mountain Time returns to MST.
  const snapshot = runtimeClockSnapshot(new Date("2026-11-10T07:15:00.000Z"));

  assert.equal(snapshot.date, "2026-11-10");
  assert.equal(snapshot.time, "00:15:00");
  assert.equal(snapshot.zoneAbbreviation, "MST");
});

test("runtime clock instruction explicitly outranks stale project and chat dates", () => {
  const snapshot = runtimeClockSnapshot(new Date("2026-09-23T06:32:45.000Z"));
  const instructions = runtimeClockInstruction(snapshot);

  assert.match(instructions, /AUTHORITATIVE RUNTIME CLOCK/);
  assert.match(instructions, /Current local date: 2026-09-23/);
  assert.match(instructions, /Timezone: America\/Denver/);
  assert.match(instructions, /source of truth/i);
  assert.match(instructions, /project context/i);
  assert.match(instructions, /Never infer the current date from project metadata or conversation history/);
});

test("runtime clock output is project-independent", () => {
  const now = new Date("2026-09-23T06:32:45.000Z");
  const a = runtimeClockInstruction(runtimeClockSnapshot(now));
  const b = runtimeClockInstruction(runtimeClockSnapshot(now));

  assert.equal(a, b);
  assert.doesNotMatch(a, /Dakota Wireless|Smoke Signals|Timekeeper|Rez Lock/i);
});
