type Element = { id: string; isDeleted?: boolean; [key: string]: unknown };
const visible = (canvas: unknown): Element[] => {
  const elements = (canvas as { elements?: unknown } | null)?.elements;
  const rows: unknown[] = Array.isArray(elements) ? elements : [];
  return rows.filter(
    (item): item is Element =>
      !!item &&
      typeof item === 'object' &&
      'id' in item &&
      typeof item.id === 'string' &&
      item.id.length <= 128 &&
      !('isDeleted' in item && item.isDeleted),
  );
};
export const changedElementIds = (
  before: unknown,
  after: unknown,
  requested?: string[],
) => {
  const next = visible(after);
  const ids = new Set(next.map((element) => element.id));
  if (requested?.length)
    return [...new Set(requested)].filter((id) => ids.has(id)).slice(0, 50);
  const previous = new Map(
    visible(before).map((element) => [element.id, element]),
  );
  const added = next
    .filter((element) => !previous.has(element.id))
    .sort((a, b) => Number(b.type === 'frame') - Number(a.type === 'frame'));
  return (
    added.length
      ? added
      : next.filter(
          (element) =>
            JSON.stringify(previous.get(element.id)) !==
            JSON.stringify(element),
        )
  )
    .map((element) => element.id)
    .slice(0, 50);
};
