import { DateTime } from "luxon";

const timezone = "Europe/Prague";

export function createDateTimeForSpecificDay(
  timeString: string,
  dayString?: string
): DateTime {
  const [hours, minutes] = timeString.split(":").map(Number);

  if (
    isNaN(hours) ||
    isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw new Error(
      `Invalid time format: ${timeString}. Expected HH:MM format.`
    );
  }

  if (dayString) {
    // Parse day string (remove trailing dot if present)
    const cleanDayString = dayString.replace(/\.$/, "");
    const [day, month] = cleanDayString.split(".").map(Number);

    if (
      isNaN(day) ||
      isNaN(month) ||
      day < 1 ||
      day > 31 ||
      month < 1 ||
      month > 12
    ) {
      throw new Error(
        `Invalid day format: ${dayString}. Expected DD.MM or DD.MM. format.`
      );
    }

    // Use current year
    const currentYear = DateTime.now().setZone(timezone).year;

    // Create date with specified day and month
    const specificDate = DateTime.fromObject(
      {
        year: currentYear,
        month: month,
        day: day,
        hour: hours,
        minute: minutes,
      },
      { zone: timezone }
    );

    if (!specificDate.isValid) {
      throw new Error(
        `Invalid date: ${day}.${month}.${currentYear} - ${specificDate.invalidReason}`
      );
    }

    return specificDate;
  } else {
    // Original behavior - use today
    return DateTime.now()
      .setZone(timezone)
      .startOf("day")
      .plus({ hours, minutes });
  }
}

export function createDateTimeForToday(timeString: string): DateTime {
  return createDateTimeForSpecificDay(timeString, undefined);
}

export function calculateDurationMinutes(
  startDateTime: DateTime,
  endDateTime: DateTime
): number {
  return Math.round(endDateTime.diff(startDateTime, "minutes").minutes);
}

export function convertDayToISO(dateString: string, addDays?: number): string {
  const [day, month, year] = dateString.split(".");

  let pragueDateTime = DateTime.fromObject(
    {
      year: parseInt(year),
      month: parseInt(month),
      day: parseInt(day),
    },
    { zone: timezone }
  );

  if (addDays) {
    pragueDateTime = pragueDateTime.plus({ days: addDays });
  }

  const iso = pragueDateTime.toISO({ suppressMilliseconds: true });
  if (!iso) {
    throw new Error("Invalid date " + dateString);
  }

  return iso;
}

export function convertDayAndTimeToIso(dateString: string, time: string): string {
  const [day, month, year] = dateString.trim().split(".");
  const [hour, minutes] = time.trim().split(':')

  let pragueDateTime = DateTime.fromObject(
    {
      year: parseInt(year),
      month: parseInt(month),
      day: parseInt(day),
      hour: parseInt(hour),
      minute: parseInt(minutes),
    },
    { zone: timezone }
  );


  const iso = pragueDateTime.toISO({ suppressMilliseconds: true });
  if (!iso) {
    throw new Error("Invalid date " + dateString);
  }

  return iso;
}

export function getCurrentMonth() {
  const now = DateTime.now().setZone(timezone);
  const startOfMonth = now.startOf("month");
  const endOfMonth = now.endOf("month").startOf("second");

  return {
    now,
    isoStart: startOfMonth.toISO({ suppressMilliseconds: true }) ?? "",
    isoEnd: endOfMonth.toISO({ suppressMilliseconds: true }) ?? "",
  };
}

export function getCurrentDay() {
  const now = DateTime.now().setZone(timezone);
  const startOfDay = now.startOf("day");
  const endOfDay = now.plus({ days: 1 }).startOf('day');

  return {
    now,
    isoStart: startOfDay.toISO({ suppressMilliseconds: true }) ?? "",
    isoEnd: endOfDay.toISO({ suppressMilliseconds: true }) ?? "",
  };
}

export function getTodayToEndOfYear() {
  const now = DateTime.now().setZone(timezone);
  const startOfDay = now.startOf("day");
  const endOfYear = now.endOf("year").startOf("second");

  return {
    now,
    isoStart: startOfDay.toISO({ suppressMilliseconds: true }) ?? "",
    isoEnd: endOfYear.toISO({ suppressMilliseconds: true }) ?? "",
  };
}

export function isSameDay(start: string, end: string) {
  const startDate = DateTime.fromISO(start).setZone(timezone);
  const endDate = DateTime.fromISO(end).setZone(timezone);

  return startDate.hasSame(endDate, "day");
}

export function isWorkDay(date: string) {
  const d = DateTime.fromISO(date).setZone(timezone);

  return d.weekday <= 5;
}

export function getStartDay(date: string) {
  const d = DateTime.fromISO(date).setZone(timezone);

  return d.startOf("day");
}

export function getTodayFormatted(): string {
  const now = DateTime.now().setZone(timezone);
  return now.toFormat("d.M.yyyy");
}
