import { FormSkeleton } from "@/components/loading/form-skeleton";

export default function Loading() {
  return <FormSkeleton label="Loading settings…" fields={3} narrow />;
}
