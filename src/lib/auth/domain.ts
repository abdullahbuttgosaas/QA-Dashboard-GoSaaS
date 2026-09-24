// Pure helper so the rule can be reused by the login action and tested in isolation.
// The database enforces the same rule independently (see migrations) — this is not the only guard.
export function isAllowedEmail(email: string, allowedDomain: string): boolean {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at <= 0) return false;
  return normalized.slice(at + 1) === allowedDomain.toLowerCase();
}
