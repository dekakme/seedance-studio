import { Workspace } from "@/components/workspace/Workspace";
import { getDb, listJobs } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function Home() {
  return <Workspace initialJobs={listJobs(getDb())} />;
}
