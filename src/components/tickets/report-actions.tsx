import { buttonClass } from "@/components/ui/button";

// Download for an uploaded QA report. It goes through the app's document route, which redirects to a short-lived
// signed URL (the bucket is never public) with Content-Disposition: attachment and the original file name.
export const REPORT_ACTION_CLASS = buttonClass("secondary", "sm", "min-w-28");

export function ReportActions({ href, fileName }: { href: string; fileName: string }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
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
