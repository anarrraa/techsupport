# Frontend Setup: Dashboard UI with shadcn/ui

## Quick Start (5 min)

```bash
# 1. Create React + Vite project
npm create vite@latest dashboard -- --template react-ts
cd dashboard

# 2. Install dependencies
npm install
npm install -D tailwindcss postcss autoprefixer
npm install @radix-ui/react-* recharts date-fns clsx

# 3. Initialize shadcn/ui
npx shadcn-ui@latest init

# 4. Add shadcn components we need
npx shadcn-ui@latest add button
npx shadcn-ui@latest add card
npx shadcn-ui@latest add table
npx shadcn-ui@latest add dialog
npx shadcn-ui@latest add tabs
npx shadcn-ui@latest add input
npx shadcn-ui@latest add select
npx shadcn-ui@latest add dropdown-menu
npx shadcn-ui@latest add badge
npx shadcn-ui@latest add progress

# 5. Install React Query
npm install @tanstack/react-query

# 6. Install router
npm install react-router-dom

# 7. Start dev server
npm run dev
```

---

## Project Structure

Create the folder structure matching `/docs/implementation-stack.md`:

```bash
mkdir -p src/{pages,components/{layout,metrics,tables,chat,common},hooks,utils}
mkdir -p src/types
```

---

## Core Files to Create

### 1. `src/types/dashboard.ts` — Type definitions

```typescript
export interface MetricCard {
  label: string;
  value: string | number;
  unit?: string;
  trend?: {
    direction: 'up' | 'down' | 'neutral';
    percentage: number;
    text: string;
  };
  icon?: React.ReactNode;
}

export interface TeamMember {
  id: string;
  name: string;
  tickets: number;
  avgResponse: string;
  breaches: number;
  compliance: number;
  rating: number;
}

export interface MonthlyReport {
  month: string;
  system: string;
  metrics: MetricCard[];
  teamTable: TeamMember[];
  trends: TrendData[];
  slaByPriority: PriorityBreakdown[];
}

export interface TrendData {
  month: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface PriorityBreakdown {
  priority: string;
  tickets: number;
  avgResponse: string;
  compliance: number;
  trend: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'system';
  content: string;
  timestamp: Date;
  trace?: Record<string, any>;
}
```

### 2. `src/utils/api-client.ts` — API wrapper

```typescript
const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

export const api = {
  reports: {
    getMonthly: (month: string, system?: string) =>
      fetch(`${API_BASE}/reports/${month}?system=${system || 'All'}`).then(r => r.json()),
    export: (month: string, format: 'pdf' | 'excel') =>
      fetch(`${API_BASE}/reports/${month}/export?format=${format}`).then(r => r.blob()),
  },
  
  metrics: {
    getSummary: () =>
      fetch(`${API_BASE}/metrics/summary`).then(r => r.json()),
    getSLAByPriority: () =>
      fetch(`${API_BASE}/metrics/sla-by-priority`).then(r => r.json()),
  },
  
  teams: {
    getPerformance: (month: string) =>
      fetch(`${API_BASE}/teams/performance?month=${month}`).then(r => r.json()),
    getDetails: (memberId: string) =>
      fetch(`${API_BASE}/teams/${memberId}/details`).then(r => r.json()),
  },
  
  trends: {
    getResponseTime: (priority?: string) =>
      fetch(`${API_BASE}/trends/response-time${priority ? `?priority=${priority}` : ''}`).then(r => r.json()),
    getCompliance: () =>
      fetch(`${API_BASE}/trends/compliance`).then(r => r.json()),
  },
  
  chat: {
    query: (question: string, month: string) =>
      fetch(`${API_BASE}/chat/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, month }),
      }).then(r => r.json()),
    history: (limit = 20) =>
      fetch(`${API_BASE}/chat/history?limit=${limit}`).then(r => r.json()),
  },
};
```

### 3. `src/hooks/useMonthlyReport.ts` — React Query hook

```typescript
import { useQuery } from '@tanstack/react-query';
import { api } from '../utils/api-client';

export const useMonthlyReport = (month: string, system: string = 'All') => {
  return useQuery({
    queryKey: ['report', month, system],
    queryFn: () => api.reports.getMonthly(month, system),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};
```

### 4. `src/components/layout/Header.tsx` — Dashboard header

```typescript
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { MonthPicker, SystemSelector, ExportMenu } from './';

export function Header() {
  const now = new Date();
  const [month, setMonth] = React.useState(format(now, 'yyyy-MM'));
  const [system, setSystem] = React.useState('All');

  return (
    <header className="border-b border-gray-200 bg-white px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tech Success Dashboard</h1>
          <p className="text-sm text-gray-500">Monthly support metrics & team performance</p>
        </div>

        <div className="flex gap-4 items-center">
          <MonthPicker value={month} onChange={setMonth} />
          <SystemSelector value={system} onChange={setSystem} />
          <ExportMenu month={month} system={system} />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
```

### 5. `src/components/metrics/MetricCard.tsx` — Single metric card

```typescript
import { Card } from '@/components/ui/card';
import { TrendIcon } from './TrendIcon';

interface Props {
  label: string;
  value: string | number;
  trend?: { direction: 'up' | 'down' | 'neutral'; text: string };
  icon?: React.ReactNode;
}

export function MetricCard({ label, value, trend, icon }: Props) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-600">{label}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        {icon && <div className="text-2xl text-gray-400">{icon}</div>}
      </div>

      {trend && (
        <div className={`mt-2 text-sm font-medium flex items-center gap-1 ${
          trend.direction === 'up' ? 'text-green-600' : 'text-red-600'
        }`}>
          <TrendIcon direction={trend.direction} />
          {trend.text}
        </div>
      )}
    </Card>
  );
}
```

### 6. `src/pages/DashboardPage.tsx` — Main dashboard

```typescript
import React from 'react';
import { useMonthlyReport } from '@/hooks/useMonthlyReport';
import { Header } from '@/components/layout/Header';
import { MetricCard } from '@/components/metrics/MetricCard';
import { TeamPerformanceTable } from '@/components/tables/TeamPerformanceTable';
import { TrendChart } from '@/components/metrics/TrendChart';

export function DashboardPage() {
  const [month, setMonth] = React.useState('2026-10');
  const [system, setSystem] = React.useState('All');

  const { data: report, isLoading, error } = useMonthlyReport(month, system);

  if (isLoading) return <div className="p-8">Loading...</div>;
  if (error) return <div className="p-8 text-red-600">Error loading report</div>;
  if (!report) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header month={month} system={system} onMonthChange={setMonth} onSystemChange={setSystem} />

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Executive Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {report.metrics.map((metric, i) => (
            <MetricCard key={i} {...metric} />
          ))}
        </div>

        {/* Trends */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <TrendChart data={report.trends} title="Response Time Trend" />
          <TrendChart data={report.compliance} title="SLA Compliance Trend" />
        </div>

        {/* Team Performance */}
        <div className="mb-8">
          <h2 className="text-xl font-bold mb-4">Team Performance</h2>
          <TeamPerformanceTable data={report.teamTable} />
        </div>
      </main>
    </div>
  );
}
```

---

## Tailwind Configuration

In `tailwind.config.ts`, extend with Mongolian font support:

```typescript
export default {
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
};
```

---

## Environment Variables

Create `.env.local`:

```
VITE_API_URL=http://localhost:3001/api
VITE_APP_NAME=Tech Success Dashboard
```

---

## Development Workflow

1. **Run dev server**: `npm run dev`
2. **Start backend**: In another terminal, `npm run dev:backend`
3. **Build for production**: `npm run build`
4. **Preview production build**: `npm run preview`

---

## Responsive Design Notes

- **Mobile (<640px)**: Single column, stacked cards
- **Tablet (640-1024px)**: 2 columns, charts 100% width
- **Desktop (>1024px)**: Full layout, side-by-side columns

Use Tailwind's responsive prefixes: `md:` (768px), `lg:` (1024px), `xl:` (1280px)

---

## Dark Mode

shadcn/ui includes dark mode support. Add to `<html>`:

```html
<html class="dark">
```

Or implement a theme toggle:

```typescript
export function ThemeToggle() {
  const [isDark, setIsDark] = React.useState(false);
  
  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setIsDark(!isDark)}
    >
      {isDark ? '☀️' : '🌙'}
    </Button>
  );
}
```

---

## Chart Integration (Recharts)

Example for a simple line chart:

```typescript
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

export function TrendChart({ data }) {
  return (
    <LineChart width={500} height={300} data={data}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="month" />
      <YAxis />
      <Tooltip />
      <Legend />
      <Line type="monotone" dataKey="critical" stroke="#dc2626" />
      <Line type="monotone" dataKey="high" stroke="#ea580c" />
    </LineChart>
  );
}
```

---

## Next: Backend Setup

See `docs/implementation-stack.md` for Express.js + Prisma backend.
