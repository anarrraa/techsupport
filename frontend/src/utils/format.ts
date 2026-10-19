export type Locale = "mn" | "en";

const tag = (locale: Locale) => (locale === "mn" ? "mn-MN" : "en-US");

export const formatNumber = (n: number, locale: Locale) =>
  new Intl.NumberFormat(tag(locale)).format(n);

export const formatPercent = (ratio: number, locale: Locale) =>
  new Intl.NumberFormat(tag(locale), { style: "percent", maximumFractionDigits: 1 }).format(ratio);

// Date-only strings are parsed as UTC; format in UTC so the day never shifts.
export const formatDate = (isoDate: string, locale: Locale) =>
  locale === "mn"
    ? isoDate.slice(0, 10).replaceAll("-", ".") // design system: YYYY.MM.DD
    : new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(isoDate));

// Browsers ship no Mongolian month names in Intl, so Mongolian is spelled out by hand.
export const formatMonth = (yearMonth: string, locale: Locale) =>
  locale === "mn"
    ? `${yearMonth.slice(0, 4)} оны ${Number(yearMonth.slice(5, 7))}-р сар`
    : new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", timeZone: "UTC" }).format(
        new Date(`${yearMonth}-01T00:00:00Z`),
      );

/** 95 → "1h 35m" / "1ц 35м". */
export function formatDuration(minutes: number, locale: Locale) {
  const [h, m] = locale === "mn" ? ["ц", "м"] : ["h", "m"];
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest}${m}`;
  return rest === 0 ? `${hours}${h}` : `${hours}${h} ${rest}${m}`;
}
