export const TABLE_PAGE_SIZE = 10;

export function paginateItems<T>(
  items: T[],
  page: number,
  pageSize: number = TABLE_PAGE_SIZE
): {
  page: number;
  totalPages: number;
  pagedItems: T[];
  rangeStart: number;
  rangeEnd: number;
  total: number;
} {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  const pagedItems = items.slice(start, start + pageSize);
  return {
    page: safePage,
    totalPages,
    pagedItems,
    rangeStart: total === 0 ? 0 : start + 1,
    rangeEnd: Math.min(start + pageSize, total),
    total,
  };
}
