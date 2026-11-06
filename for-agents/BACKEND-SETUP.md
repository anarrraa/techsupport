# Backend Setup: Express.js + Prisma + PostgreSQL

> Original setup plan. Code blocks below are the plan, not the shipped code.
> Shipped equivalents: aggregation `src/monthly-report/monthly-report.ts` (`aggregateMonth`),
> snapshot capture + Prisma client `src/backend/db.ts` (`captureSnapshot`), routes `src/backend/server.ts`.
> Chat engine is not built yet (phase 3, `src/docs-chat/`).

## Quick Start (5 min)

```bash
# 1. Install dependencies
npm install express dotenv jsonwebtoken cors
npm install -D typescript ts-node @types/node @types/express

# 2. Initialize Prisma
npm install @prisma/client prisma
npx prisma init

# 3. Set DATABASE_URL in .env
# postgres://user:password@localhost:5432/dashboard

# 4. Run migrations
npx prisma migrate dev --name init

# 5. Start backend
npm run dev:backend
```

---

## Database Setup

### PostgreSQL (Local or Managed)

**Local with Docker:**
```bash
docker run --name postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=dashboard \
  -p 5432:5432 \
  -d postgres:15
```

**Managed services:**
- **Vercel Postgres** (built-in): Recommended for Vercel deployment
- **Railway** (simple, free tier): railway.app
- **Render** (PostgreSQL hosting): render.com
- **AWS RDS** (production): Expensive but scalable

### .env Configuration

```
DATABASE_URL=postgres://user:password@localhost:5432/dashboard
NODE_ENV=development
PORT=3001
JWT_SECRET=your-secret-key-here
JIRA_BASE_URL=https://your-jira-instance.atlassian.net
JIRA_EMAIL=integration@example.com
JIRA_API_TOKEN=your-jira-token
```

---

## Core Files

### 1. `src/backend/server.ts` — Express setup

```typescript
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const app = express();
const prisma = new PrismaClient();

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Routes (to be implemented)
app.use('/api/reports', require('./routes/reports'));
app.use('/api/metrics', require('./routes/metrics'));
app.use('/api/teams', require('./routes/teams'));
app.use('/api/trends', require('./routes/trends'));
app.use('/api/chat', require('./routes/chat'));

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
  console.log(`Database: ${process.env.DATABASE_URL}`);
});
```

### 2. `src/monthly-report/monthly-report.ts` — Aggregate queries

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function getMonthlyMetrics(month: string, system?: string) {
  // Query SLASnapshot for the given month
  const snapshots = await prisma.slaSnapshot.findMany({
    where: {
      month,
      ...(system && system !== 'All' && { system }),
    },
  });

  if (snapshots.length === 0) {
    throw new Error(`No data for ${month}`);
  }

  // Aggregate
  const total = snapshots.length;
  const breaches = snapshots.filter(s => s.firstResponseSLABreached).length;
  const avgResponse = Math.round(
    snapshots.reduce((sum, s) => sum + s.firstResponseSLAElapsed, 0) / total
  );
  const compliance = ((total - breaches) / total * 100).toFixed(1);

  return {
    month,
    system: system || 'All',
    ticketsHandled: total,
    breachedCount: breaches,
    avgResponseMinutes: avgResponse,
    slaCompliancePercent: parseFloat(compliance),
  };
}

export async function getSLAByPriority(month: string, system?: string) {
  const snapshots = await prisma.slaSnapshot.findMany({
    where: {
      month,
      ...(system && system !== 'All' && { system }),
    },
  });

  const byPriority = snapshots.reduce((acc: Record<string, any>, s) => {
    if (!acc[s.priority]) {
      acc[s.priority] = { tickets: 0, breaches: 0, totalElapsed: 0 };
    }
    acc[s.priority].tickets++;
    if (s.firstResponseSLABreached) acc[s.priority].breaches++;
    acc[s.priority].totalElapsed += s.firstResponseSLAElapsed;
    return acc;
  }, {});

  return Object.entries(byPriority).map(([priority, data]: [string, any]) => ({
    priority,
    tickets: data.tickets,
    avgResponse: minutesToHM(Math.round(data.totalElapsed / data.tickets)),
    compliance: ((data.tickets - data.breaches) / data.tickets * 100).toFixed(1),
    trend: '0', // TODO: Compare with previous month
  }));
}

function minutesToHM(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}
```

### 3. `src/backend/routes/reports.ts` — Report endpoints

```typescript
import { Router, Request, Response } from 'express';
import { getMonthlyMetrics, getSLAByPriority } from '../monthly-report/monthly-report.ts';

const router = Router();

// GET /api/reports/:month
router.get('/:month', async (req: Request, res: Response) => {
  try {
    const { month } = req.params;
    const { system } = req.query;

    const metrics = await getMonthlyMetrics(month, system as string);
    const slaByPriority = await getSLAByPriority(month, system as string);
    // TODO: Fetch team table, trends, etc.

    res.json({
      month,
      system: system || 'All',
      metrics: [
        {
          label: 'Tickets Handled',
          value: metrics.ticketsHandled,
          trend: { direction: 'up', percentage: 12, text: '↑ +12 from last month' },
        },
        {
          label: 'SLA Compliance',
          value: `${metrics.slaCompliancePercent}%`,
          trend: { direction: 'down', percentage: 2.1, text: '↓ -2.1% from last month' },
        },
        {
          label: 'Avg Response Time',
          value: minutesToHM(metrics.avgResponseMinutes),
        },
        {
          label: 'Team Utilization',
          value: (metrics.ticketsHandled / 8).toFixed(1),
        },
      ],
      slaByPriority,
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// GET /api/reports/:month/export?format=pdf
router.get('/:month/export', async (req: Request, res: Response) => {
  try {
    const { month } = req.params;
    const { format } = req.query;

    if (format === 'pdf') {
      // TODO: Generate PDF using PDFKit
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=report-${month}.pdf`);
    } else if (format === 'excel') {
      // TODO: Generate Excel using node-xlsx
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=report-${month}.xlsx`);
    }

    // res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

export default router;
```

### 4. `src/backend/db.ts` — Snapshot capture (run during reminder workflow)

```typescript
import { PrismaClient } from '@prisma/client';
import { getJiraTickets, getJiraSLA } from './jira'; // Reuse MVP adapter

const prisma = new PrismaClient();

export async function captureMonthlySnapshot() {
  const month = new Date().toISOString().slice(0, 7); // "2026-10"
  const now = new Date();

  // 1. Query Jira for all tickets in scope
  const tickets = await getJiraTickets(); // Reuse MVP function

  // 2. For each ticket, read SLA state from JSM
  const snapshots = await Promise.all(
    tickets.map(async (ticket) => {
      const slaData = await getJiraSLA(ticket.key); // Reuse MVP function
      
      return {
        ticketKey: ticket.key,
        system: extractSystem(ticket.key), // "GP", "DC", etc.
        priority: ticket.priority,
        assigneeId: ticket.assignee?.accountId,
        assigneeName: ticket.assignee?.displayName,
        status: ticket.status,
        firstResponseSLAElapsed: slaData.firstResponse?.elapsedTime || 0,
        firstResponseSLABreached: slaData.firstResponse?.breached || false,
        firstResponseSLAPaused: slaData.firstResponse?.paused || false,
        resolutionSLAElapsed: slaData.resolution?.elapsedTime || 0,
        resolutionSLABreached: slaData.resolution?.breached || false,
        resolutionSLAPaused: slaData.resolution?.paused || false,
        capturedAt: now,
        month,
      };
    })
  );

  // 3. Write to database (upsert to avoid duplicates)
  for (const snapshot of snapshots) {
    await prisma.slaSnapshot.upsert({
      where: { ticketKey_capturedAt: { ticketKey: snapshot.ticketKey, capturedAt: now } },
      update: snapshot,
      create: snapshot,
    });
  }

  console.log(`✅ Captured ${snapshots.length} snapshots for ${month}`);
}

function extractSystem(ticketKey: string): string {
  const prefix = ticketKey.split('-')[0];
  if (prefix === 'DC') return 'DC';
  if (prefix === 'GP') return 'GP';
  return 'Other';
}
```

### 5. `src/backend/routes/chat.ts` — Admin chat endpoints

```typescript
import { Router, Request, Response } from 'express';
import { query } from '../docs-chat/chat-engine.ts'; // not built yet (phase 3)

const router = Router();

// POST /api/chat/query
router.post('/query', async (req: Request, res: Response) => {
  try {
    const { question, month } = req.body;

    // Parse question and determine what queries to run
    const result = await query(question, month);

    res.json({
      question,
      answer: result.answer,
      trace: result.trace,
      metrics: result.metrics,
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// GET /api/chat/history?limit=20
router.get('/history', async (req: Request, res: Response) => {
  try {
    const { limit = 20 } = req.query;
    // TODO: Query ChatMessage table
    res.json([]);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

export default router;
```

---

## Integration with MVP Workflow

Add snapshot capture to the existing reminder workflow:

```typescript
// src/workflows/jira-teams-reminder.ts (MODIFIED)

import { captureMonthlySnapshot } from '../backend/db.ts';

export async function jiraTeamsReminderWorkflow() {
  // ... existing reminder logic ...

  // NEW: Capture monthly snapshot after sending reminders
  try {
    await captureMonthlySnapshot();
    console.log('✅ Monthly snapshot captured');
  } catch (error) {
    console.error('⚠️ Snapshot capture failed:', error);
    // Don't fail the workflow if snapshot fails
  }

  // ... rest of workflow ...
}
```

---

## TypeScript Setup

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"],
  "exclude": ["node_modules"]
}
```

---

## package.json Scripts

```json
{
  "scripts": {
    "dev": "concurrently \"npm run dev:backend\" \"npm run dev:frontend\"",
    "dev:backend": "ts-node src/backend/server.ts",
    "dev:frontend": "cd frontend && npm run dev",
    "build": "tsc && npm run build:frontend",
    "build:frontend": "cd frontend && npm run build",
    "prisma:migrate": "prisma migrate dev",
    "prisma:studio": "prisma studio",
    "test": "jest",
    "lint": "eslint src --ext .ts"
  }
}
```

---

## Deployment Checklist

- [ ] DATABASE_URL set in production environment
- [ ] JWT_SECRET configured (use strong random string)
- [ ] JIRA credentials in secrets (never in code)
- [ ] CORS configured for frontend domain
- [ ] Error logging (e.g., Sentry)
- [ ] Database backups enabled
- [ ] API rate limiting configured
- [ ] Health check endpoint verified

---

## Troubleshooting

### "Column does not exist" errors
```bash
npx prisma migrate dev --name <description>
```

### Database connection timeout
- Check DATABASE_URL is correct
- Verify PostgreSQL is running
- Check firewall/network access

### Snapshot capture failing
- Verify JIRA credentials work
- Check Jira API rate limits
- Look at logs: `npm run dev:backend`

---

## Next: Testing & Deployment

Once backend is running:
1. Test endpoints with Postman/curl
2. Connect frontend to backend
3. Deploy to production (Vercel, Railway, etc.)
