export function templateCampusFilter(campusId: string): string {
  if (!campusId || /[^a-z0-9_-]/.test(campusId)) throw new Error('Invalid campus id');
  return `campus_id.eq.${campusId},campus_id.is.null`;
}

export function isSharedTemplate(t: { campus_id: string | null }): boolean {
  return t.campus_id === null;
}
