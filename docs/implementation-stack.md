# V2 Dashboard Implementation Stack

## Tech Stack

### Frontend
- **Framework**: React 18 + TypeScript
- **Component Library**: shadcn/ui (copy-paste components)
- **Styling**: Tailwind CSS + CSS-in-JS
- **Charts**: Recharts (React component library for charts)
- **State**: TanStack Query (React Query) for server state
- **Build**: Vite (fast dev server, optimized builds)
- **Package Manager**: npm

### Backend
- **Runtime**: Node.js + TypeScript
- **Framework**: Express.js (minimal, familiar)
- **Database**: PostgreSQL (time-series data for snapshots)
- **ORM**: Prisma (type-safe, auto-generated schemas)
- **Authentication**: GitHub OIDC (same as reminder workflow)

### External APIs
- **Jira JSM**: Existing Jira Adapter (reuse from MVP)
- **Microsoft Graph**: For Teams bot (if escalation enabled)

---

## Project Structure

```
zero-techsupport/
├── src/
│   ├── lib/
│   │   ├── jira.ts (existing adapter, reuse)
│   │   ├── db.ts (new: Prisma client)
│   │   ├── queries/ (new)
│   │   │   ├── monthly-metrics.ts
│   │   │   ├── team-performance.ts
│   │   │   ├── sla-trends.ts
│   │   │   └── system-comparison.ts
│   │   └── snapshots.ts (new: capture & store)
│   │
│   ├── workflows/ (existing)
│   │   └── jira-teams-reminder.ts (add snapshot capture)
│   │
│   ├── backend/ (new)
│   │   ├── server.ts
│   │   ├── middleware/
│   │   │   ├── auth.ts
│   │   │   └── error-handler.ts
│   │   └── routes/
│   │       ├── reports.ts (GET /api/reports/:month)
│   │       ├── metrics.ts (GET /api/metrics)
│   │       ├── teams.ts (GET /api/teams)
│   │       ├── trends.ts (GET /api/trends)
│   │       └── export.ts (POST /api/export/pdf, /api/export/excel)
│   │
│   ├── frontend/ (new)
│   │   ├── pages/
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── ReportPage.tsx
│   │   │   ├── AdminChatPage.tsx
│   │   │   └── NotFound.tsx
│   │   │
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Header.tsx
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   └── Footer.tsx
│   │   │   ├── metrics/
│   │   │   │   ├── MetricCard.tsx
│   │   │   │   ├── SummaryMetrics.tsx
│   │   │   │   └── TrendChart.tsx
│   │   │   ├── tables/
│   │   │   │   ├── TeamPerformanceTable.tsx
│   │   │   │   ├── SystemComparisonTable.tsx
│   │   │   │   └── TicketTable.tsx
│   │   │   ├── chat/
│   │   │   │   ├── AdminChat.tsx
│   │   │   │   ├── ChatMessage.tsx
│   │   │   │   └── ChatInput.tsx
│   │   │   └── common/
│   │   │       ├── Button.tsx (shadcn)
│   │   │       ├── Card.tsx (shadcn)
│   │   │       ├── Dialog.tsx (shadcn)
│   │   │       ├── Tabs.tsx (shadcn)
│   │   │       └── Spinner.tsx
│   │   │
│   │   ├── hooks/
│   │   │   ├── useMonthlyReport.ts
│   │   │   ├── useTeamMetrics.ts
│   │   │   └── useChatQuery.ts
│   │   │
│   │   ├── utils/
│   │   │   ├── format.ts (Mongolian dates, numbers)
│   │   │   ├── colors.ts (semantic colors)
│   │   │   └── api-client.ts
│   │   │
│   │   ├── App.tsx
│   │   ├── index.css (Tailwind)
│   │   └── main.tsx
│   │
│   └── types/
│       ├── dashboard.ts
│       ├── report.ts
│       ├── metrics.ts
│       └── jira.ts
│
├── prisma/
│   ├── schema.prisma (new)
│   └── migrations/ (auto-generated)
│
├── public/
│   ├── favicon.svg
│   └── logo.svg
│
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── .env.example
├── .gitignore
└── README.md
```

---

## Database Schema (Prisma)

```prisma
// prisma/schema.prisma

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// Monthly SLA snapshot (captured daily during reminder run)
model SLASnapshot {
  id            String   @id @default(cuid())
  ticketKey     String
  system        String   // "GP", "DC", "Other"
  priority      String   // "Critical", "High", "Medium", "Low"
  assigneeId    String   // Jira account ID
  assigneeName  String
  status        String   // "Open", "In Progress", etc.
  
  // SLA metrics (from Jira JSM)
  firstResponseSLAElapsed   Int     // Minutes (working hours)
  firstResponseSLABreached  Boolean
  firstResponseSLAPaused    Boolean
  
  resolutionSLAElapsed      Int     // Minutes
  resolutionSLABreached     Boolean
  resolutionSLAPaused       Boolean
  
  // Metadata
  createdAt     DateTime @default(now())
  capturedAt    DateTime // When this snapshot was captured (month start for historical, daily for current)
  month         String   // "2026-10" format for partitioning
  
  @@composite_key([ticketKey, capturedAt])
  @@index([month])
  @@index([assigneeId])
  @@index([system])
}

// Monthly report metadata (one per month per system)
model MonthlyReport {
  id            String   @id @default(cuid())
  month         String   // "2026-10" format
  system        String   // "GP", "DC", "Other", or "All"
  
  // Aggregate metrics
  ticketsHandled      Int
  avgResponseTime     Int     // Minutes
  slaCompliancePercent Float  // 0-100
  breachCount         Int
  
  // Team metrics
  topPerformer        String? // Assignee name
  topPerformerScore   Float?
  
  // Comparisons
  vs_previousMonth    Json    // {compliance_delta: +2.1, response_delta: -15}
  
  generatedAt  DateTime @default(now())
  @@composite_key([month, system])
}

// Chat history (optional, for conversation replay)
model ChatMessage {
  id          String   @id @default(cuid())
  userId      String   // GitHub user ID or email
  question    String
  response    String   // LLM response (if used)
  queryTrace  Json     // Full decision trace
  
  createdAt   DateTime @default(now())
  month       String   // "2026-10" format
  @@index([userId, month])
}

// Team member profile (link Jira ID to display name & Entra OID)
model TeamMember {
  id          String   @id @default(cuid())
  jiraId      String   @unique
  displayName String
  email       String   @unique
  entraObjectId String?
  
  isActive    Boolean @default(true)
  createdAt   DateTime @default(now())
}
```

---

## API Endpoints

### Reports
- `GET /api/reports/:month` → Monthly report (all metrics, charts, tables)
  - Query params: `?system=GP` (filter by system)
  - Response: `{ metrics, charts, teamTable, trends }`

- `GET /api/reports/:month/export` → Export as PDF or Excel
  - Query params: `?format=pdf&sections=all` or `?format=excel`
  - Response: Binary (PDF/XLSX file)

### Metrics
- `GET /api/metrics/summary` → Executive summary (4 KPI cards)
  - Response: `{ total, compliance, avgResponse, teamUtilization }`

- `GET /api/metrics/sla-by-priority` → SLA breakdown by priority
  - Response: `[{ priority, tickets, compliance, trend }, ...]`

### Teams
- `GET /api/teams/performance` → Team member performance table
  - Query params: `?month=2026-10&sort=compliance`
  - Response: `[{ name, tickets, avgResponse, breaches, compliance, rating }, ...]`

- `GET /api/teams/:memberId/details` → Single person's detailed view
  - Response: `{ name, stats, tickets, trends }`

### Trends
- `GET /api/trends/response-time` → 3-month response time trend
  - Query params: `?priority=High` (filter by priority)
  - Response: `{ months: ["July", "Aug", "Sept"], values: [120, 125, 118] }`

- `GET /api/trends/compliance` → 3-month compliance trend
  - Response: `{ months: [...], compliance: [...], target: 95 }`

### Admin Chat
- `POST /api/chat/query` → Process natural language question
  - Body: `{ question: "What's happening now?", month: "2026-10" }`
  - Response: `{ answer, trace, metrics }`

- `GET /api/chat/history` → Retrieve past queries
  - Query params: `?limit=20`
  - Response: `[{ question, timestamp }, ...]`

### System Comparison
- `GET /api/systems/comparison` → Compare all systems
  - Response: `{ systems: [{ name: "GP", tickets: 62, compliance: 98.4 }, ...] }`

---

## Frontend Routes

```
/                          → Redirect to /dashboard
/dashboard                 → Main dashboard (current month, all systems)
/dashboard/:month          → Specific month view
/dashboard?system=GP       → Filter by system
/reports                   → Reports list (monthly archive)
/reports/:month            → Monthly report detail
/admin-chat                → Chat interface for queries
/teams                     → Team performance overview
/teams/:memberId           → Individual team member details
/export                    → Export/download page
/not-found                 → 404
```

---

## Data Flow

### 1. Daily Snapshot Capture (Workflow)
```
Reminder workflow runs (10:00, 15:00 Ulaanbaatar)
  ↓
Query Jira for all tickets in scope
  ↓
For each ticket: read SLA state from JSM
  ↓
Write to SLASnapshot table (capturedAt = now)
  ↓
Aggregate to MonthlyReport table
  ↓
Trigger dashboard refresh (WebSocket or polling)
```

### 2. Dashboard Query (Frontend)
```
User visits /dashboard?month=2026-10
  ↓
React Query fetches /api/reports/2026-10
  ↓
Backend queries SLASnapshot table (WHERE month='2026-10')
  ↓
Aggregate into metrics (avg, sum, group-by)
  ↓
Return JSON to frontend
  ↓
Components render charts & tables
```

### 3. Admin Chat Query (Frontend)
```
User types "What's happening now?"
  ↓
POST /api/chat/query { question, month }
  ↓
Backend parses question → determines metric queries needed
  ↓
Query SLASnapshot + MonthlyReport tables
  ↓
Optional: Send aggregate counts to Gemini for summary
  ↓
Return answer + decision trace
  ↓
Chat component renders response
```

---

## Authentication & Deployment

### Auth
- **Reuse MVP**: GitHub OIDC from reminder workflow
- **User context**: GitHub user ID in JWT token
- **Scope**: Team members only (email check against org list)

### Deployment
- **Frontend**: Vercel or Netlify (static files + API routes)
- **Backend**: GitHub Actions or AWS Lambda (serverless) or same host as workflow
- **Database**: Managed PostgreSQL (Vercel Postgres, Render, Railway)
- **Env vars**: Same structure as MVP (`.env`, `.env.local` not committed)

---

## Phase 1: MVP (4 weeks)

1. **Week 1-2**: Setup + schema
   - Create React + Express project structure
   - Set up Prisma schema & run migrations
   - Implement `/api/reports/:month` (basic aggregation)

2. **Week 3**: Components
   - Build shadcn/ui components (Button, Card, Table, Dialog)
   - Implement DashboardPage + components (metrics, tables)
   - Connect React Query to backend

3. **Week 4**: Polish + Export
   - Add charts (Recharts)
   - Implement PDF/Excel export (PDFKit or node-xlsx)
   - Deploy to staging

---

## Dependencies (package.json)

### Frontend
```json
"dependencies": {
  "react": "^18.2.0",
  "react-dom": "^18.2.0",
  "react-router-dom": "^6.20.0",
  "@tanstack/react-query": "^5.25.0",
  "recharts": "^2.10.0",
  "tailwindcss": "^3.4.0",
  "@radix-ui/react-*": "latest",
  "clsx": "^2.0.0",
  "date-fns": "^2.30.0"
},
"devDependencies": {
  "typescript": "^5.3.0",
  "vite": "^5.0.0",
  "@vitejs/plugin-react": "^4.2.0"
}
```

### Backend
```json
"dependencies": {
  "express": "^4.18.0",
  "prisma": "^5.7.0",
  "@prisma/client": "^5.7.0",
  "dotenv": "^16.3.0",
  "jsonwebtoken": "^9.1.0",
  "pdfkit": "^0.13.0",
  "node-xlsx": "^0.21.0"
},
"devDependencies": {
  "typescript": "^5.3.0",
  "ts-node": "^10.9.0",
  "@types/node": "^20.10.0",
  "@types/express": "^4.17.21"
}
```

---

## Next Steps

1. **Initialize project**: `npm create vite@latest dashboard -- --template react-ts`
2. **Install dependencies**: `npm install` + shadcn/ui setup
3. **Setup Prisma**: `npm install prisma @prisma/client`
4. **Create `.env`**: `DATABASE_URL=postgres://...`
5. **Run migrations**: `npx prisma migrate dev`
6. **Start dev**: `npm run dev` (Vite) + backend on `:3001`
