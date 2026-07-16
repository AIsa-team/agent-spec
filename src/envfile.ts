import type { AgentManifest } from "./schema/manifest.js";

export function buildEnvExample(m: AgentManifest): string {
  // .env is user-owned: keys only. System vars (HERMES_HOME, PROFILE_ID,
  // MODEL_*) must never be seeded here — updates preserve the user's .env,
  // which would freeze them forever, and hermes loads .env with override
  // semantics (HERMES_HOME in it clobbers the --profile switch). System
  // defaults travel with the artifact in agent.json; render.sh reads them
  // from there.
  const lines: string[] = [
    `# ${m.name} — user environment for the hermes profile (keys only)`,
    `# Copy to .env and fill in the values. NEVER commit real keys.`,
    ``,
  ];
  if (m.env.required.length) lines.push(`# ── required ──`);
  for (const v of m.env.required) {
    lines.push(`# ${v.description}`, `${v.name}=`, ``);
  }
  if (m.env.optional.length) lines.push(`# ── optional ──`);
  for (const v of m.env.optional) {
    lines.push(`# ${v.description}${v.degrade ? ` (degrade: ${v.degrade})` : ""}`, `# ${v.name}=`, ``);
  }
  return lines.join("\n");
}
