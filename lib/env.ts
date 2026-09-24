export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

/** Reads HF_CREDENTIALS ("key-id:key-secret"), the same variable the official SDK uses. */
export function higgsfieldCredentials(): { keyId: string; keySecret: string } {
  const raw = requireEnv("HF_CREDENTIALS");
  const sep = raw.indexOf(":");
  if (sep <= 0 || sep === raw.length - 1) throw new Error("HF_CREDENTIALS must be in key-id:key-secret format");
  return { keyId: raw.slice(0, sep), keySecret: raw.slice(sep + 1) };
}
