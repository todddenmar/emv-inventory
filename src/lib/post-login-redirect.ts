export function resolvePostLoginRedirect(
  isStaff: boolean,
  redirect: string
): string {
  const path = redirect || "/";

  if (isStaff) {
    return path.startsWith("/admin") ? path : "/admin";
  }

  if (path.startsWith("/admin")) return "/";
  return path;
}
