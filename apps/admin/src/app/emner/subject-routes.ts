export function buildSubjectDetailHref(topicId: string): string {
  return `/emner/${encodeURIComponent(topicId)}`;
}

export function buildNewSkillHref(
  topicId: string,
  { suggestWithAi = false }: { suggestWithAi?: boolean } = {},
): string {
  const baseHref = `${buildSubjectDetailHref(topicId)}/faerdigheder/ny`;
  return suggestWithAi ? `${baseHref}?mode=suggest` : baseHref;
}
