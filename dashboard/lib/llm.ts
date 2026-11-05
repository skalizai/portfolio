const FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

export function llmModel(): string {
  return process.env.LLM_MODEL || "claude-sonnet-5-5";
}

/** Falls back to another model if a safety check wrongly declines the request. */
export function fallbackParams(model: string) {
  return FALLBACK_MODELS.has(model)
    ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
    : {};
}
