import { redirect } from "next/navigation";

// the history now lives next to the composer on the home page
export default function GalleryPage() {
  redirect("/");
}
