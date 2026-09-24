import { getDb } from "./db";
import { getHiggsfield } from "./higgsfield";
import type { RefreshDeps } from "./jobs";
import { downloadVideo } from "./storage";

export function refreshDeps(): RefreshDeps {
  return {
    db: getDb(),
    // resolved lazily so missing keys surface as a caught status error, not a crash
    hf: { getStatus: (url) => getHiggsfield().getStatus(url) },
    download: (url, fileName) => downloadVideo(url, fileName),
  };
}
