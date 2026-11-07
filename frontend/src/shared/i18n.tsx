import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Locale } from "@/shared/utils/format";

const en = {
  "reports.priorityNote": "Chart and table show mapped contract priorities. Other Jira priorities are included in overall totals and exports.",
  "reports.month": "Report month (UTC)",
  "reports.refresh": "Refresh",
  "reports.retry": "Try again",
  "reports.exportError": "Download failed. Try the PDF or Excel button again.",
  "reports.archive": "Reports archive",
  "support.title": "Generate support report",
  "support.description": "Upload a Jira export (.xlsx or .csv). Download one PDF per report group. The file is not stored.",
  "support.file": "Jira export",
  "support.config": "Client",
  "support.noConfigs": "No client configs found in config/support-report/.",
  "support.from": "From month",
  "support.to": "To month",
  "support.groups": "Download one PDF per report group:",
  "support.tooLarge": "The file is too large (limit 10 MB / 20,000 rows).",
  "support.invalid": "The file could not be processed:",
  "reports.archiveDescription": "Captured months from the last 12 UTC months",
  "reports.noArchive": "No captured reports yet. Reports appear after snapshot collection starts.",
  "reports.observed": "Observed tickets",
  "reports.capturedDays": "Captured UTC days",
  "reports.firstCapture": "First capture (UTC)",
  "reports.lastCapture": "Last capture (UTC)",
  "reports.sampleNote": "Sampled Jira observations: latest snapshot per observed ticket. Resolved tickets outside the scan may be absent. This is not complete contractual monthly compliance.",
  "reports.coverage": "Observation coverage",
  "reports.flags": "SLA flag coverage",
  "reports.known": "Known",
  "reports.missing": "Missing",
  "reports.firstResponse": "First response",
  "reports.resolution": "Resolution",
  "reports.breachShare": "Breached / all observed tickets",
  "reports.noRate": "No observations",
  "reports.data": "Observed SLA results",
  "reports.priority": "Priority",
  "reports.open": "Open report",
  "reports.tooLarge": "This month exceeds the reporting limit. Ask the administrator to review capture volume.",
  "reports.rateNote": "Shares use all observed tickets as the denominator. Missing SLA flags are unknown, not healthy.",

  appName: "Tech Success",
  "nav.dashboard": "Dashboard",
  "nav.reports": "Reports",
  "nav.teams": "Team",
  "nav.adminChat": "Admin chat",
  "theme.toggle": "Toggle dark mode",
  "lang.toggle": "Switch language",
  "auth.signOut": "Sign out",
  "menu.open": "Open menu",
  "menu.close": "Close menu",
  "metric.avgResponse": "Average first response",
  "metric.tickets": "Requests",
  "metric.breaches": "First response breaches",
  "metric.compliance": "First response observed non-breach share",
  "metric.vsLastMonth": "vs last month",
  "priority.title": "SLA by priority",
  "priority.critical": "Critical",
  "priority.high": "High",
  "priority.medium": "Medium",
  "priority.low": "Low",
  "reports.title": "Monthly report",
  "chat.title": "Admin chat",
  "chat.placeholder": "Ask about a client system's documentation…",
  "chat.send": "Send",
  "chat.empty": "Ask a question to get started.",
  "chat.notice": "Answers come only from the client system documents and cite them. Check the sources.",
  "chat.suggest1": "How is a payment refunded?",
  "chat.suggest2": "How does a user log in to the app?",
  "chat.client": "Client",
  "chat.allClients": "All clients",
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
  "reports.priorityNote": "График, хүснэгтэд гэрээний ангилалд харгалзсан ач холбогдлыг харуулна. Бусад Jira ангилал нийт дүн болон экспортод багтана.",
  "reports.month": "Тайлангийн сар (UTC)",
  "reports.refresh": "Шинэчлэх",
  "reports.retry": "Дахин оролдох",
  "reports.exportError": "Татаж чадсангүй. PDF эсвэл Excel товчоор дахин оролдоно уу.",
  "reports.archive": "Тайлангийн архив",
  "support.title": "Тайлан үүсгэх",
  "support.description": "Jira экспорт (.xlsx эсвэл .csv) оруулна уу. Тайлангийн бүлэг тус бүрээр PDF татна. Файлыг хадгалахгүй.",
  "support.file": "Jira экспорт",
  "support.config": "Харилцагч",
  "support.noConfigs": "config/support-report/ дотор харилцагчийн тохиргоо алга.",
  "support.from": "Эхлэх сар",
  "support.to": "Дуусах сар",
  "support.groups": "Тайлангийн бүлэг тус бүрээр PDF татах:",
  "support.tooLarge": "Файл хэт том байна (хязгаар 10 MB / 20 000 мөр).",
  "support.invalid": "Файлыг боловсруулж чадсангүй:",
  "reports.archiveDescription": "Сүүлийн 12 UTC сарын хэмжилттэй тайлангууд",
  "reports.noArchive": "Хадгалсан тайлан алга. Хэмжилт цуглуулж эхэлсний дараа тайлан харагдана.",
  "reports.observed": "Хэмжилтэд орсон хүсэлт",
  "reports.capturedDays": "Хэмжилттэй UTC өдөр",
  "reports.firstCapture": "Эхний хэмжилт (UTC)",
  "reports.lastCapture": "Сүүлийн хэмжилт (UTC)",
  "reports.sampleNote": "Jira-ийн түүвэр хэмжилт: хүсэлт бүрийн хамгийн сүүлийн хэмжилтийг тоолно. Хайлтад хамрагдаагүй шийдэгдсэн хүсэлтүүд байхгүй байж болно. Энэ нь гэрээний сарын бүрэн биелэлтийн тайлан биш.",
  "reports.coverage": "Хэмжилтийн хамрах хүрээ",
  "reports.flags": "SLA төлөвийн хамрах хүрээ",
  "reports.known": "Мэдэгдэж буй",
  "reports.missing": "Мэдээлэлгүй",
  "reports.firstResponse": "Анхны хариу",
  "reports.resolution": "Шийдвэрлэлт",
  "reports.breachShare": "Зөрчилтэй / хэмжилтэд орсон бүх хүсэлт",
  "reports.noRate": "Хэмжилтгүй",
  "reports.data": "Хэмжилтийн SLA үр дүн",
  "reports.priority": "Ач холбогдол",
  "reports.open": "Тайлан нээх",
  "reports.tooLarge": "Энэ сар тайлангийн хэмжээг хэтрүүлсэн байна. Администраторт хандаж хэмжилтийн хэмжээг шалгуулна уу.",
  "reports.rateNote": "Хувийн хуваарь нь хэмжилтэд орсон бүх хүсэлт. SLA мэдээлэлгүй хүсэлтийг хэвийн гэж үзэхгүй.",

  appName: "Tech Success",
  "nav.dashboard": "Хянах самбар",
  "nav.reports": "Тайлан",
  "nav.teams": "Баг",
  "nav.adminChat": "Админ чат",
  "theme.toggle": "Харанхуй горим солих",
  "lang.toggle": "Хэл солих",
  "auth.signOut": "Гарах",
  "menu.open": "Цэс нээх",
  "menu.close": "Цэс хаах",
  "metric.avgResponse": "Анхны хариуны дундаж хугацаа",
  "metric.tickets": "Хүсэлт",
  "metric.breaches": "Анхны хариуны зөрчил",
  "metric.compliance": "Анхны хариуны ажиглагдсан зөрчилгүй хувь",
  "metric.vsLastMonth": "өмнөх сартай харьцуулахад",
  "priority.title": "Ач холбогдлоор SLA",
  "priority.critical": "Яаралтай",
  "priority.high": "Өндөр",
  "priority.medium": "Дунд",
  "priority.low": "Бага",
  "reports.title": "Сарын тайлан",
  "chat.title": "Админ чат",
  "chat.placeholder": "Харилцагчийн системийн баримт бичгийн талаар асуух…",
  "chat.send": "Илгээх",
  "chat.empty": "Асуулт асууж эхлээрэй.",
  "chat.notice": "Хариулт зөвхөн харилцагчийн системийн баримт бичгээс гарч, эх сурвалжаа заана. Эх сурвалжийг шалгаарай.",
  "chat.suggest1": "Төлбөрийн буцаалт хэрхэн хийгддэг вэ?",
  "chat.suggest2": "Хэрэглэгч апп руу хэрхэн нэвтэрдэг вэ?",
  "chat.client": "Харилцагч",
  "chat.allClients": "Бүх харилцагч",
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
