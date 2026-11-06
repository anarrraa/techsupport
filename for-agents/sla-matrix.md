# SLA & Escalation matrix (from the service contract, Хавсралт 6)

Source of truth for the reminder/escalation agent. Extracted from `Хавсралтууд.docx`.

## Severity → Jira priority mapping (assumed)

| Contract severity | Jira priority (likely) |
| ----------------- | ---------------------- |
| Маш ноцтой (Critical) | Highest |
| Ноцтой (High)     | High |
| Дунд (Medium)     | Medium |
| Бага (Low)        | Low |

> Confirm against the actual priority scheme in Jira (a sample ticket used `Highest`).

## 1. First response + resolution SLA (Засварлах хугацааны хязгаар)

| Severity | First response (Анхны хариу) | Resolution (Засварлах) | Definition |
| -------- | ---------------------------- | ---------------------- | ---------- |
| 🔴 Critical (Маш ноцтой) | **30 min** | **4 working hours** | Систем бүрэн зогссон, хэрэглэгч үйлчилгээ авах боломжгүй |
| 🟠 High (Ноцтой) | **45 min** | **8 working hours** | Чухал функц доголдсон, олон хэрэглэгчид нөлөөлсөн |
| 🟡 Medium (Дунд) | **1 hour** | **16 working hours** | Зарим функц доголдсон, гол ажиллагаанд томоохон нөлөөгүй |
| ⚪ Low (Бага) | **4 hours** | **32 working hours** | Үндсэн ажиллагаа хэрэглэгчид нөлөөлөхгүй |

All clocks run in **working hours only**: Mon–Fri 09:00–18:00.

## 2. Escalation timeline (Эскалацийн матриц — шатлалын хугацаа)

Levels: **L1** Дэмжлэгийн баг · **L2** Хөгжүүлэгч · **L3** Багийн ахлагч · **L4** Технологи хариуцсан захирал · **L5** Гүйцэтгэх захирал

| Severity | First response | → L2 (unresolved) | → L3 | → L4 | → L5 |
| -------- | -------------- | ----------------- | ---- | ---- | ---- |
| 🔴 Critical | 30 min | after 4h | +4h | +5h | +6h |
| 🟠 High | 45 min | after 8h | +8h | +9h | +10h |
| 🟡 Medium | 1h | after 16h | +16h | +17h | +18h |
| ⚪ Low | 4h | after 32h | +32h | +33h | (only if SLA breached) |

> "+Xh" = additional hours after the previous level's mark.

## 3. Notification rules — working vs non-working hours

| Condition | Notification | Contact | Note |
| --------- | ------------ | ------- | ---- |
| Working hours — all levels | Sequential | Ticket system | Escalates to next level when the previous doesn't resolve |
| Off-hours — Critical / High | **Parallel + phone call** | Systems NOC (engineer) | L1 & L2 notified simultaneously; call the on-call NOC engineer |
| Off-hours — Medium / Low | Sequential | Ticket system | Technical Success team reviews next working day |

**Working hours:** Mon–Fri 09:00–18:00. **Off-hours:** 18:00–09:00, Sat, Sun, public holidays.

## 4. Non-defect request escalation (reference — not defect SLA)

| Request type | Route | Response time | Unit cap |
| ------------ | ----- | ------------- | -------- |
| Improvement (GP) | TS → Dev → QA → TS → Deploy | 5 working days | 24 person-hours |
| Improvement (Others) | TS → Dev → QA → TS → Deploy | 5 working days | 8 person-hours |
| Paid change | TS → PM/BA → Client → Dev | price quote in 2 working days | — |
| New development | TS → PM/BA → new contract | proposal in 10 working days | — |

## 5. Reporting

- **Monthly** → Technical Success → Client: SLA compliance, defect stats, recurring issues, breaches, improvement stats.
- **Weekly** → Technical Success → Team Lead, CTO: unresolved defects, recurring issues, process improvements, progress.
