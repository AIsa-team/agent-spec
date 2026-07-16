import type { AgentManifest } from "./schema/manifest.js";

export function buildEnvExample(m: AgentManifest): string {
  const lines: string[] = [
    `# ${m.name} — environment for the hermes profile (rendered at install time)`,
    `# Copy to .env and fill in the values. NEVER commit real keys.`,
    ``,
    `PROFILE_ID=${m.id}`,
    // No HERMES_HOME here: hermes loads the profile's .env with override
    // semantics, so shipping it would clobber the --profile HERMES_HOME
    // switch (and dotenv never expands the tilde). render.sh has its own
    // ~/.hermes default.
    `MODEL_DEFAULT=${m.models.default}`,
    `MODEL_PROVIDER=${m.models.provider}`,
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
