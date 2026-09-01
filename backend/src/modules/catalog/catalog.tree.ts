import { CategoryNode, CategoryRecord } from "./catalog.types";

export function buildCategoryTree(
  records: readonly CategoryRecord[],
): CategoryNode[] {
  const nodes = new Map<string, CategoryNode>();
  for (const record of records) {
    if (!record.nameEn.trim() || !record.nameBn.trim()) {
      throw new Error(`Category ${record.id} is missing a bilingual name`);
    }
    if (nodes.has(record.id)) {
      throw new Error(`Duplicate category ${record.id}`);
    }
    nodes.set(record.id, { ...record, children: [] });
  }
  assertParentChains(nodes);

  const roots: CategoryNode[] = [];
  for (const node of nodes.values()) {
    if (node.parentId === null) {
      roots.push(node);
      continue;
    }
    const parent = nodes.get(node.parentId);
    if (!parent) throw new Error(`Category ${node.id} has an unknown parent`);
    parent.children.push(node);
  }

  sortNodes(roots);
  return roots;
}

function assertParentChains(nodes: ReadonlyMap<string, CategoryNode>): void {
  for (const node of nodes.values()) {
    const visited = new Set<string>();
    let current: CategoryNode | undefined = node;
    let depth = 1;
    while (current !== undefined) {
      if (visited.has(current.id)) {
        throw new Error(`Category cycle at ${current.id}`);
      }
      if (depth > 2) {
        throw new Error(`Category ${node.id} exceeds the maximum depth of two`);
      }
      visited.add(current.id);
      if (current.parentId === null) break;
      current = nodes.get(current.parentId);
      if (!current) {
        throw new Error(`Category ${node.id} has an unknown parent`);
      }
      depth++;
    }
  }
}

function sortNodes(nodes: CategoryNode[]): void {
  nodes.sort(
    (left, right) =>
      left.sortOrder - right.sortOrder ||
      left.nameEn.localeCompare(right.nameEn),
  );
  nodes.forEach((node) => sortNodes(node.children));
}
