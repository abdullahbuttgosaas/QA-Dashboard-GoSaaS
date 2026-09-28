"use client";

import { useState } from "react";
import { buttonClass } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";

// Same plain POST to /auth/signout as before (works without JavaScript); this only adds the pending state and
// blocks a second submit while the request is in flight.
export function SignOutButton() {
  const [pending, setPending] = useState(false);
  return (
    <form
      action="/auth/signout"
      method="post"
      onSubmit={(e) => {
        if (pending) e.preventDefault();
        else setPending(true);
      }}
    >
      <LoadingButton type="submit" pending={pending} pendingLabel="Signing out…" className={buttonClass("ghost", "sm")}>
        Sign out
      </LoadingButton>
    </form>
  );
}
