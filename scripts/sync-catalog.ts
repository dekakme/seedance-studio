// Builds lib/catalog.json: every Higgsfield video model endpoint with its name, category, pricing text and
// input JSON schema, read from the public docs. Run with `npm run sync-models` when Higgsfield adds models.
import fs from "node:fs";
import path from "node:path";

const DOCS = "https://docs.higgsfield.ai";
const MODEL_DOCS = "https://dash.higgsfield.ai/models";

export interface CatalogEntry {
  /** model id, also the API path: POST https://api.higgsfield.ai/<id> */
  id: string;
  family: string;
  name: string;
  workflow: string;
  category: string;
  description: string;
  pricing: string;
  schema: Record<string, unknown>;
}

async function text(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

const titleCase = (s: string) => s.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function section(doc: string, heading: string): string {
  const m = new RegExp(`^## ${heading}\\s*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, "m").exec(doc);
  return m ? m[1].trim() : "";
}

async function main() {
  const index = await text(`${DOCS}/docs/models/video-generation.md`);
  // the index is a list of HTML cards: <a href="/docs/models/x"> … <span className="featured-model-title">Name</span>
  const families = [...index.matchAll(/href="(\/docs\/models\/[\w-]+)"[\s\S]*?featured-model-title">([^<]+)</g)]
    .map(([, link, name]) => ({ name: name.trim(), link }))
    .filter((f, i, all) => all.findIndex((g) => g.link === f.link) === i);
  console.log(`${families.length} families`);

  const catalog: CatalogEntry[] = [];
  for (const family of families) {
    const page = await text(`${DOCS}${family.link}.md`);
    const ids = [...new Set([...page.matchAll(/POST\s+`?\/([\w.\-/]+)/g)].map((m) => m[1]))];
    for (const id of ids) {
      try {
        const doc = await text(`${MODEL_DOCS}/${id}/llms.txt`);
        const schemaJson = /### Input JSON Schema\s*\n\s*```json\s*\n([\s\S]*?)\n```/.exec(doc)?.[1];
        if (!schemaJson) throw new Error("no input schema");
        catalog.push({
          id,
          family: family.name,
          name: /^# (.+)$/m.exec(doc)?.[1].trim() ?? family.name,
          workflow: titleCase(id.split("/").pop() ?? id),
          category: /\*\*Category\*\*:\s*`?([^`\n]+)/.exec(doc)?.[1].trim() ?? "",
          description: /^> (.+)$/m.exec(doc)?.[1].trim() ?? "",
          pricing: section(doc, "Pricing").replace(/\s+/g, " "),
          schema: JSON.parse(schemaJson),
        });
        console.log(`  ✓ ${id}`);
      } catch (err) {
        console.warn(`  ✗ ${id}: ${(err as Error).message}`);
      }
    }
  }

  const out = path.join(process.cwd(), "lib", "catalog.json");
  fs.writeFileSync(out, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`wrote ${catalog.length} models to ${out}`);
}

void main();
