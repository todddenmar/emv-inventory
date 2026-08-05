export function resolvePostLoginRedirect(
  isStaff: boolean,
  redirect: string
): string {
  const path = redirect || "/admin";

  if (isStaff) {
    return path.startsWith("/admin") ? path : "/admin";
  }

  // Non-staff cannot access the inventory app
  return "/login?denied=1";
}
