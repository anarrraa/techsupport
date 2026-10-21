import type { MonthlyReport } from '@/types/report';

interface ReportSpreadsheetProps {
  report: MonthlyReport;
  month: string;
}

export function ReportSpreadsheet({ report, month }: ReportSpreadsheetProps) {
  return (
    <div className="w-full overflow-x-auto border border-gray-200 rounded-lg">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-100 border-b">
            <th className="px-4 py-3 text-left font-semibold">SLA Report: {month}</th>
            <th className="px-4 py-3 text-right"></th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b bg-white hover:bg-gray-50">
            <td className="px-4 py-2 font-medium">Tickets Handled</td>
            <td className="px-4 py-2 text-right">{report.summary.tickets.value}</td>
          </tr>
          <tr className="border-b bg-white hover:bg-gray-50">
            <td className="px-4 py-2 font-medium">First Response Breached</td>
            <td className="px-4 py-2 text-right">{report.summary.breaches.value}</td>
          </tr>
          <tr className="border-b bg-white hover:bg-gray-50">
            <td className="px-4 py-2 font-medium">Compliance %</td>
            <td className="px-4 py-2 text-right">
              {report.summary.compliance.value !== null 
                ? (report.summary.compliance.value * 100).toFixed(1) + '%'
                : 'N/A'}
            </td>
          </tr>
          <tr className="bg-gray-50">
            <td colSpan={2} className="px-4 py-3 font-semibold">Priority Breakdown</td>
          </tr>
          <tr className="bg-gray-100 border-b">
            <th className="px-4 py-2 text-left font-semibold">Priority</th>
            <th className="px-4 py-2 text-right font-semibold">Tickets / Breached</th>
          </tr>
          {report.byPriority.map((p) => (
            <tr key={p.priority} className="border-b bg-white hover:bg-gray-50">
              <td className="px-4 py-2 capitalize">{p.priority}</td>
              <td className="px-4 py-2 text-right">{p.tickets} / {p.breaches}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
