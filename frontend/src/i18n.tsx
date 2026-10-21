import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Locale } from "@/utils/format";

const en = {
  appName: "Tech Success",
  "nav.dashboard": "Dashboard",
  "nav.reports": "Reports",
  "nav.teams": "Team",
  "nav.adminChat": "Admin chat",
  "theme.toggle": "Toggle dark mode",
  "lang.toggle": "Switch language",
  "menu.open": "Open menu",
  "menu.close": "Close menu",
  "metric.tickets": "Requests",
  "metric.breaches": "First response breaches",
  "metric.compliance": "First response compliance",
  "metric.vsLastMonth": "vs last month",
  "priority.title": "SLA by priority",
  "priority.critical": "Critical",
  "priority.high": "High",
  "priority.medium": "Medium",
  "priority.low": "Low",
  "reports.title": "Monthly report",
  "chat.title": "Admin chat",
  "chat.placeholder": "Ask about tickets, load, or trends…",
  "chat.send": "Send",
  "chat.empty": "Ask a question to get started.",
  "chat.notice": "Mock mode: chat is not connected to the backend yet.",
  "chat.suggest1": "What happened this month?",
  "chat.suggest2": "Who is overloaded?",
  "state.loading": "Loading…",
  "state.error": "Could not load data.",
  "metric.resolutionBreaches": "Resolution breaches",
  "chart.title": "Requests and breaches by priority",
  "reports.snapshots": "snapshots",
  "teams.unavailable": "Per-assignee figures are not collected: the dashboard stores no people, only JSM SLA counts.",
  "state.empty": "No snapshots for this month yet.",
};

type Key = keyof typeof en;

const mn: Record<Key, string> = {
  appName: "Tech Success",
  "nav.dashboard": "Хянах самбар",
  "nav.reports": "Тайлан",
  "nav.teams": "Баг",
  "nav.adminChat": "Админ чат",
  "theme.toggle": "Харанхуй горим солих",
  "lang.toggle": "Хэл солих",
  "menu.open": "Цэс нээх",
  "menu.close": "Цэс хаах",
  "metric.tickets": "Хүсэлт",
  "metric.breaches": "Анхны хариуны зөрчил",
  "metric.compliance": "Анхны хариуны биелэлт",
  "metric.vsLastMonth": "өмнөх сартай харьцуулахад",
  "priority.title": "Ач холбогдлоор SLA",
  "priority.critical": "Яаралтай",
  "priority.high": "Өндөр",
  "priority.medium": "Дунд",
  "priority.low": "Бага",
  "reports.title": "Сарын тайлан",
  "chat.title": "Админ чат",
  "chat.placeholder": "Хүсэлт, ачаалал, чиг хандлагын талаар асуух…",
  "chat.send": "Илгээх",
  "chat.empty": "Асуулт асууж эхлээрэй.",
  "chat.notice": "Туршилтын горим: чат backend-д хараахан холбогдоогүй.",
  "chat.suggest1": "Энэ сард юу болсон бэ?",
  "chat.suggest2": "Хэн хэт ачаалалтай байна?",
  "state.loading": "Ачаалж байна…",
  "state.error": "Өгөгдөл ачаалж чадсангүй.",
  "metric.resolutionBreaches": "Шийдвэрлэлтийн зөрчил",
  "chart.title": "Ач холбогдлоор хүсэлт ба зөрчил",
  "reports.snapshots": "хэмжилт",
  "teams.unavailable": "Хариуцагч тус бүрийн үзүүлэлт цуглуулдаггүй: самбар хүний мэдээлэл хадгалахгүй, зөвхөн JSM SLA тоо.",
  "state.empty": "Энэ сард хэмжилт хараахан алга.",
};

const dictionaries = { en, mn };

const I18nContext = createContext<{ locale: Locale; setLocale: (l: Locale) => void } | null>(null);

function readLocale(): Locale {
  try {
    return localStorage.getItem("locale") === "en" ? "en" : "mn";
  } catch {
    return "mn";
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(readLocale);
  useEffect(() => {
    document.documentElement.lang = locale;
    try {
      localStorage.setItem("locale", locale);
    } catch {
      // Private mode: the choice just isn't remembered.
    }
  }, [locale]);
  return <I18nContext.Provider value={{ locale, setLocale }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return { ...ctx, t: (key: Key) => dictionaries[ctx.locale][key] };
}
