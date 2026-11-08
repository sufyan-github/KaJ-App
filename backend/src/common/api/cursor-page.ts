/** Cursor paging: fetch one extra row to know whether another page exists. */
export function pageArgs(query: { limit: number; cursor?: string }) {
  return {
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  };
}

export function pageResult<T extends { id: string }>(rows: T[], limit: number) {
  const items = rows.slice(0, limit);
  return {
    items,
    nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null,
  };
}
