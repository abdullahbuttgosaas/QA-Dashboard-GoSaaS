import { buttonClass } from "@/components/ui/button";

// Open + Download for an uploaded QA report. Both go through the app's document route, which redirects to a
// short-lived signed URL (the bucket is never public). Open uses no Content-Disposition, so the browser shows the
// file inline when it can (PDF); formats browsers cannot render (e.g. .docx) are downloaded by the browser instead.
export const REPORT_ACTION_CLASS = buttonClass("secondary", "sm", "min-w-28");

export function ReportActions({ href, fileName }: { href: string; fileName: string }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open ${fileName} in a new tab`}
        data-report-action="open"
        className={REPORT_ACTION_CLASS}
      >
        <svg aria-hidden viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M12 9.5v3.25c0 .41-.34.75-.75.75h-8a.75.75 0 0 1-.75-.75v-8c0-.41.34-.75.75-.75H6.5" />
        </svg>
        Open
      </a>
      <a
        href={`${href}?download=1`}
        download={fileName}
        aria-label={`Download ${fileName}`}
        data-report-action="download"
        className={REPORT_ACTION_CLASS}
      >
        <svg aria-hidden viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M8 2.5v8M4.5 7.5 8 11l3.5-3.5M2.5 13.5h11" />
        </svg>
        Download
      </a>
    </div>
  );
}
