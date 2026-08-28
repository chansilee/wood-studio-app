/** A 純管理 owner is hidden from every member-picker, but their existing records stay intact */
export function isSelectableMember(m: { role: string; pure_management?: boolean }): boolean {
  return !(m.role === 'owner' && m.pure_management)
}
