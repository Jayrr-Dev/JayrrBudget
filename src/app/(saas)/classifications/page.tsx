import { ClassificationsPanel } from "@/domains/classifications/ui/ClassificationsPanel";

type Tab = "sections" | "categories" | "subcategories" | "tags";

function parseTab(value: string | undefined): Tab | undefined {
  if (
    value === "sections" ||
    value === "categories" ||
    value === "subcategories" ||
    value === "tags"
  ) {
    return value;
  }
  return undefined;
}

function first(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function ClassificationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string | string[];
    create?: string | string[];
  }>;
}) {
  const params = await searchParams;
  return (
    <ClassificationsPanel
      initialTab={parseTab(first(params.tab))}
      openCreate={first(params.create) === "1"}
    />
  );
}
