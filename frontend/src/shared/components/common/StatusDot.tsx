import { breachStatus, statusDot } from "@/shared/utils/colors";

// Never color alone: callers render the breach count next to the dot.
export function StatusDot({ breaches }: { breaches: number }) {
  return <span aria-hidden className={`inline-block size-2 rounded-full ${statusDot[breachStatus(breaches)]}`} />;
}
