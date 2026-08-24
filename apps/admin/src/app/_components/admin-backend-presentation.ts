import type { AdminBackend } from "@/lib/auth/backend";

export type AdminBackendPresentation = Readonly<{
  description: string;
  label: "Lokal Supabase" | "Hosted Development";
  tone: "local" | "hosted";
}>;

const presentations: Record<AdminBackend, AdminBackendPresentation> = {
  local: {
    description: "Administrationen læser og gemmer i den lokale database.",
    label: "Lokal Supabase",
    tone: "local",
  },
  development: {
    description:
      "Administrationen læser og gemmer i den delte hosted development-database.",
    label: "Hosted Development",
    tone: "hosted",
  },
};

export function getAdminBackendPresentation(
  backend: AdminBackend,
): AdminBackendPresentation {
  return presentations[backend];
}
