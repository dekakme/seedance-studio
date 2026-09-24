import { Gallery } from "@/components/gallery/Gallery";
import { getDb, listJobs } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function GalleryPage() {
  return <Gallery jobs={listJobs(getDb())} />;
}
