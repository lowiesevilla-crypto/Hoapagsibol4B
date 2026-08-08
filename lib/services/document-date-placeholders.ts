function validDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function documentIssueDayOrdinal(value: Date | string) {
  const date = validDate(value);
  if (!date) return "";

  const day = Number(
    new Intl.DateTimeFormat("en-PH", { day: "numeric" }).format(date),
  );
  const mod100 = day % 100;
  const suffix =
    mod100 >= 11 && mod100 <= 13
      ? "th"
      : day % 10 === 1
        ? "st"
        : day % 10 === 2
          ? "nd"
          : day % 10 === 3
            ? "rd"
            : "th";
  return `${day}${suffix}`;
}

export function documentIssueMonthYear(value: Date | string) {
  const date = validDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-PH", {
    month: "long",
    year: "numeric",
  }).format(date);
}
