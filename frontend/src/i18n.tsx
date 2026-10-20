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
  "metric.breaches": "SLA breaches",
  "metric.compliance": "First response compliance",
  "metric.avgResponse": "Avg first response",
  "metric.vsLastMonth": "vs last month",
  "trend.title": "Daily requests and breaches",
  "trend.tickets": "Requests",
  "trend.breaches": "Breaches",
  "priority.title": "SLA by priority",
  "priority.critical": "Critical",
  "priority.high": "High",
  "priority.medium": "Medium",
  "priority.low": "Low",
  "priority.goal": "Goal",
  "team.title": "Team performance",
  "team.name": "Assignee",
  "team.tickets": "Requests",
  "team.breaches": "Breaches",
  "team.avgResponse": "Avg first response",
  "team.compliance": "Compliance",
  "team.search": "Search assignee",
  "team.empty": "No matching assignee",
  "reports.title": "Monthly report",
  "reports.generated": "Generated",
  "reports.tabPriority": "By priority",
  "reports.tabTeam": "By assignee",
  "chat.title": "Admin chat",
  "chat.placeholder": "Ask about tickets, load, or trends…",
  "chat.send": "Send",
  "chat.empty": "Ask a question to get started.",
  "chat.notice": "Mock mode: answers use sample aggregate counts only.",
  "chat.suggest1": "What happened this month?",
  "chat.suggest2": "Who is overloaded?",
  "state.loading": "Loading…",
  "state.error": "Could not load data.",
  "dataAsOf": "Data as of",
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
  "metric.breaches": "SLA зөрчил",
  "metric.compliance": "Анхны хариуны биелэлт",
  "metric.avgResponse": "Дундаж анхны хариу",
  "metric.vsLastMonth": "өмнөх сартай харьцуулахад",
  "trend.title": "Өдөр тутмын хүсэлт ба зөрчил",
  "trend.tickets": "Хүсэлт",
  "trend.breaches": "Зөрчил",
  "priority.title": "Ач холбогдлоор SLA",
  "priority.critical": "Яаралтай",
  "priority.high": "Өндөр",
  "priority.medium": "Дунд",
  "priority.low": "Бага",
  "priority.goal": "Зорилт",
  "team.title": "Багийн гүйцэтгэл",
  "team.name": "Хариуцагч",
  "team.tickets": "Хүсэлт",
  "team.breaches": "Зөрчил",
  "team.avgResponse": "Дундаж анхны хариу",
  "team.compliance": "Биелэлт",
  "team.search": "Хариуцагч хайх",
  "team.empty": "Тохирох хариуцагч алга",
  "reports.title": "Сарын тайлан",
  "reports.generated": "Үүсгэсэн",
  "reports.tabPriority": "Ач холбогдлоор",
  "reports.tabTeam": "Хариуцагчаар",
  "chat.title": "Админ чат",
  "chat.placeholder": "Хүсэлт, ачаалал, чиг хандлагын талаар асуух…",
  "chat.send": "Илгээх",
  "chat.empty": "Асуулт асууж эхлээрэй.",
  "chat.notice": "Туршилтын горим: хариулт зөвхөн жишээ нэгдсэн тоог ашиглана.",
  "chat.suggest1": "Энэ сард юу болсон бэ?",
  "chat.suggest2": "Хэн хэт ачаалалтай байна?",
  "state.loading": "Ачаалж байна…",
  "state.error": "Өгөгдөл ачаалж чадсангүй.",
  "dataAsOf": "Өгөгдлийн огноо",
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
