import { jsearchSource } from "@/lib/sources/jsearch";
import type { JobSource } from "@/lib/sources/types";

const ALL_SOURCES: JobSource[] = [jsearchSource()];

/** Sources turned on in SOURCES_ENABLED that also have their credentials set. */
export function enabledSources(enabled: string[]): JobSource[] {
  return ALL_SOURCES.filter((source) => enabled.includes(source.name) && source.isConfigured());
}

export function sourcesFromEnv(): string[] {
  return (process.env.SOURCES_ENABLED ?? "jsearch")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}
