export type HolidayType = "work_day" | "weekly_holiday" | "holiday" | "rest_day";

const DAY_MAP: Record<number, string> = {
  0: "SUN",
  1: "MON",
  2: "TUE",
  3: "WED",
  4: "THU",
  5: "FRI",
  6: "SAT",
};

const DAY_MAP_LOWER: Record<number, string> = {
  0: "sun",
  1: "mon",
  2: "tue",
  3: "wed",
  4: "thu",
  5: "fri",
  6: "sat",
};

export type NonWorkDayDefaultType = "REST_DAY" | "HOLIDAY";

export function classifyWorkDate(
  workDate: string,
  weeklyWorkDayList: string[] = [],
  weeklyHoliday: string = "sun",
  nonWorkDayDefaultType: NonWorkDayDefaultType = "REST_DAY",
): HolidayType {
  if (!workDate) return "work_day";
  const d = new Date(`${workDate}T00:00:00`);
  const dow = d.getDay();
  const upper = DAY_MAP[dow];
  const lower = DAY_MAP_LOWER[dow];

  if (weeklyWorkDayList.includes(upper)) return "work_day";
  if (lower === String(weeklyHoliday).toLowerCase()) return "weekly_holiday";
  return nonWorkDayDefaultType === "HOLIDAY" ? "holiday" : "rest_day";
}

export function calculateHolidayWorkSurcharge(params: {
  holidayType: HolidayType;
  workType: "fixed" | "hourly" | string;
  dailyWage: number;
  workMinutes: number;
}): number {
  const { holidayType, workType, dailyWage, workMinutes } = params;

  // Only weekly_holiday and holiday qualify for surcharge
  if (holidayType !== "weekly_holiday" && holidayType !== "holiday") return 0;
  if (!dailyWage || dailyWage <= 0 || !workMinutes || workMinutes <= 0) return 0;

  const hourlyRate = workType === "hourly" ? dailyWage : dailyWage / 8;
  const hours = workMinutes / 60;

  if (hours <= 8) {
    return Math.floor(hourlyRate * hours * 0.5);
  }

  const overtimeHours = hours - 8;
  return Math.floor(hourlyRate * 8 * 0.5 + hourlyRate * overtimeHours * 1.0);
}
