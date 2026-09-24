import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover disabled:opacity-60",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-surface-muted disabled:opacity-60",
  ghost: "text-ink-secondary hover:bg-surface-muted hover:text-ink",
  danger: "border border-line-strong bg-surface text-bad hover:bg-bad-soft disabled:opacity-60",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-9 px-4 text-sm",
};

// Shared by <button> and <Link> so both look identical.
export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed",
    variants[variant],
    sizes[size],
    className,
  );
}
