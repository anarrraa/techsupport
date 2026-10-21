import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Download, FileText, Table2 } from "lucide-react";
import { api, CURRENT_MONTH } from "@/utils/api-client";

interface MonthReport {
  month: string;
  tickets: number;
  compliance: number;
}

export function ReportsPage() {
  const [reports, setReports] = useState<MonthReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingMonth, setDownloadingMonth] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    // Generate mock reports for the last 12 months
    const months: MonthReport[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const month = date.toISOString().slice(0, 7);
      months.push({
        month,
        tickets: Math.floor(Math.random() * 30) + 10,
        compliance: Math.random() * 0.3 + 0.7,
      });
    }
    setReports(months);
    setLoading(false);
  }, []);

  const handleDownloadPDF = async (month: string) => {
    setDownloadingMonth(month);
    try {
      await api.downloadPDF(month);
    } finally {
      setDownloadingMonth(null);
    }
  };

  const handleDownloadExcel = async (month: string) => {
    setDownloadingMonth(month);
    try {
      await api.downloadExcel(month);
    } finally {
      setDownloadingMonth(null);
    }
  };

  if (loading) {
    return <div className="p-8">Loading reports...</div>;
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Reports Archive</h1>
        <p className="text-gray-600">Download SLA reports from previous months</p>
      </div>

      <div className="space-y-4">
        {reports.map((report) => (
          <div
            key={report.month}
            className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
          >
            <div className="flex-1">
              <h3 className="font-semibold text-lg">
                {new Date(report.month + "-01").toLocaleDateString("default", {
                  year: "numeric",
                  month: "long",
                })}
              </h3>
              <div className="text-sm text-gray-600 mt-1 space-y-1">
                <p>Tickets: {report.tickets}</p>
                <p>Compliance: {(report.compliance * 100).toFixed(1)}%</p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDownloadPDF(report.month)}
                disabled={downloadingMonth === report.month}
                className="flex items-center gap-2"
              >
                <FileText className="w-4 h-4" />
                PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDownloadExcel(report.month)}
                disabled={downloadingMonth === report.month}
                className="flex items-center gap-2"
              >
                <Table2 className="w-4 h-4" />
                Excel
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
