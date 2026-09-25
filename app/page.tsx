import { Workspace } from "@/components/workspace/Workspace";
import type { CatalogLabels } from "@/lib/catalog";
import { CATALOG } from "@/lib/catalog-server";
import { getDb, listJobs } from "@/lib/db";

export const dynamic = "force-dynamic";

// names only: the full catalog (with schemas) is fetched by the composer when needed
const CATALOG_LABELS: CatalogLabels = Object.fromEntries(CATALOG.map((e) => [e.id, { family: e.family, workflow: e.workflow }]));

export default function Home() {
  return <Workspace initialJobs={listJobs(getDb())} catalogLabels={CATALOG_LABELS} />;
}
