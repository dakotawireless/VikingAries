export const DEFAULT_RUNTIME_TIME_ZONE = "America/Denver";

function partsToObject(parts) {
  return Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
}

export function runtimeClockSnapshot(
  now = new Date(),
  timeZone = DEFAULT_RUNTIME_TIME_ZONE
) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError("runtimeClockSnapshot requires a valid Date");
  }

  const dateParts = partsToObject(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now)
  );

  const timeParts = partsToObject(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      timeZoneName: "short",
    }).formatToParts(now)
  );

  return {
    date: `${dateParts.year}-${dateParts.month}-${dateParts.day}`,
    time: `${timeParts.hour}:${timeParts.minute}:${timeParts.second}`,
    timeZone,
    zoneAbbreviation: timeParts.timeZoneName || timeZone,
    generatedAtUtc: now.toISOString(),
  };
}

export function runtimeClockInstruction(snapshot = runtimeClockSnapshot()) {
  return [
    "AUTHORITATIVE RUNTIME CLOCK — generated fresh by the Viking Aries server for this execution:",
    `Current local date: ${snapshot.date}`,
    `Current local time: ${snapshot.time} ${snapshot.zoneAbbreviation}`,
    `Timezone: ${snapshot.timeZone}`,
    `UTC timestamp: ${snapshot.generatedAtUtc}`,
    "This runtime clock is the source of truth for the current date/time and for words such as today, tomorrow, yesterday, now, overdue, and due.",
    "Dates found in project context, files, migration notes, prior chat messages, or model knowledge are historical/contextual unless the user explicitly says they represent the current date.",
    "Never infer the current date from project metadata or conversation history, and never let stale project context override this runtime clock.",
  ].join("\n");
}
