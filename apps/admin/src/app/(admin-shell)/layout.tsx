import type { ReactNode } from "react";

import { redirect } from "next/navigation";

import { AccessDenied, AdminShell } from "../_components/admin-shell";
import { getAdminAccessSession } from "@/lib/auth/dal";

export default async function AuthenticatedAdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getAdminAccessSession();

  if (session.access.kind === "unauthenticated") {
    redirect("/login");
  }

  if (session.access.kind === "unavailable" || !session.client) {
    redirect("/login?reason=configuration");
  }

  if (session.access.kind === "denied") {
    return <AccessDenied />;
  }

  return <AdminShell profile={session.access.profile}>{children}</AdminShell>;
}
