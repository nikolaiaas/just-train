export function auditCreatorLabel(
  createdBy: string | null,
  currentAdminId: string,
): string {
  if (!createdBy) {
    return "Systemopsætning";
  }

  return createdBy === currentAdminId
    ? "Denne administrator (dig)"
    : "En anden administrator";
}
