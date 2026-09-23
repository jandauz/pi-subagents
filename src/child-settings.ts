import { SettingsManager } from "@earendil-works/pi-coding-agent";

/** Child-local overrides: never persist policy into the parent's settings. */
export function createChildSettings(cwd: string, agentDir: string, isolated: boolean): SettingsManager {
  const settings = SettingsManager.create(cwd, agentDir);
  if (isolated) {
    settings.applyOverrides({
      compaction: { enabled: false },
      retry: { enabled: false, maxRetries: 0, provider: { maxRetries: 0 } },
    });
  }
  return settings;
}
