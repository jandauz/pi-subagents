import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import type { AgentConfig } from "./types.js";

const guardedSessions = new WeakSet<object>();
export function assertCanResume(session: object) {
  if (guardedSessions.has(session)) throw new Error("Exact-selection roles require a fresh spawn, not resume");
}

const levels = new Set(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
const validated = new WeakMap<object, { name: string; id: string; thinking: string; pin?: string; effortPin?: string }>();
type Config = Pick<AgentConfig, "name" | "model" | "thinking" | "requireExactSelection">;
type Registry = { find(provider: string, id: string): any; getAvailable?(): any[] };

/** Opt-in only. Resolve against available exact identities, never the fuzzy resolver. */
export function selectExact(config: Config, requested: unknown, effort: unknown, registry: Registry) {
  const supplied = typeof requested === "string" ? requested
    : requested && typeof requested === "object" ? `${(requested as any).provider}/${(requested as any).id}` : undefined;
  if (config.model && supplied !== undefined && supplied !== config.model) throw new Error("Model contradicts role pin");
  if (config.thinking && effort !== undefined && effort !== config.thinking) throw new Error("Effort contradicts role pin");
  const id = config.model ?? supplied;
  const thinking = config.thinking ?? effort;
  if (!id || !/^[^\s/]+\/[^\s]+$/.test(id)) throw new Error("Exact provider/model selection required");
  if (typeof thinking !== "string" || !levels.has(thinking)) throw new Error("Explicit valid reasoning effort required");
  if (!registry?.getAvailable) throw new Error("Available-model registry required");
  const slash = id.indexOf("/");
  const found = registry.find(id.slice(0, slash), id.slice(slash + 1));
  if (!found || `${found.provider}/${found.id}` !== id || !registry.getAvailable().some(m => `${m.provider}/${m.id}` === id)) {
    throw new Error(`Exact model unavailable: ${id}`);
  }
  if (!getSupportedThinkingLevels(found).includes(thinking as any)) throw new Error("Selected model does not support requested reasoning effort");
  // Use canonical registry data, not caller-supplied baseUrl/auth/transport fields.
  const model = { ...found };
  validated.set(model, { name: config.name, id, thinking, pin: config.model, effortPin: config.thinking });
  return { model, thinking: thinking as NonNullable<AgentConfig["thinking"]> };
}

/** A private in-process receipt excludes unsupported entry paths and lost selections. */
export function assertExactSelection(config: Config, model: any, thinking: unknown) {
  if (!config.requireExactSelection) return;
  const proof = model && typeof model === "object" ? validated.get(model) : undefined;
  if (!proof || proof.name !== config.name || proof.pin !== config.model || proof.effortPin !== config.thinking
      || proof.id !== `${model.provider}/${model.id}` || proof.thinking !== thinking) {
    throw new Error("Exact selection missing or changed; use the validated Agent or RPC spawn path");
  }
}

/** Check before any prompt; reject SDK selection changes rather than silently accepting them. */
export function verifyExactSession(config: Config, model: any, thinking: unknown, session: {
  model?: { provider: string; id: string }; thinkingLevel?: string; dispose(): void;
}) {
  if (!config.requireExactSelection) return;
  try {
    assertExactSelection(config, model, thinking);
    if (session.model?.provider !== model.provider || session.model?.id !== model.id || session.thinkingLevel !== thinking) {
      throw new Error("Child model/effort differs from approved selection");
    }
    guardedSessions.add(session);
  } catch (error) { session.dispose(); throw error; }
}
