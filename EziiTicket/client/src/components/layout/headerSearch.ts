import type { SidebarItem } from "./Sidebar";

export type HeaderSearchItem = {
  key: string;
  label: string;
  sectionLabel?: string;
};

export function collectHeaderSearchItems(...groups: SidebarItem[][]): HeaderSearchItem[] {
  const deduped = new Map<string, HeaderSearchItem>();
  const walk = (items: SidebarItem[], parents: string[] = []) => {
    for (const item of items) {
      if (item.children?.length) {
        walk(item.children, [...parents, item.label]);
        continue;
      }
      if (!deduped.has(item.key)) {
        const sectionLabel = parents.length > 0 ? parents[parents.length - 1] : undefined;
        deduped.set(item.key, { key: item.key, label: item.label, sectionLabel });
      }
    }
  };

  for (const group of groups) walk(group);
  return Array.from(deduped.values());
}
