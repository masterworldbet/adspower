/** Reserve before any asynchronous preflight or browser startup. */
export function reserveProfile(
  id: string,
  live: ReadonlyMap<string, unknown>,
  opening: Set<string>,
): void {
  if (live.has(id) || opening.has(id)) throw Error("โปรไฟล์เปิดอยู่แล้ว");
  opening.add(id);
}
