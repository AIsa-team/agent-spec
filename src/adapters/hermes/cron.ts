import type { CronJob } from "../../schema/cron.js";

export function buildHermesCronJobs(jobs: CronJob[]): string {
  const mapped = jobs.map((j) => {
    let model: string | null = null;
    let provider: string | null = null;
    if (j.model === "default") { model = "{{MODEL_DEFAULT}}"; provider = "{{MODEL_PROVIDER}}"; }
    else if (j.model) { model = j.model; }
    return {
      id: j.id, name: j.id, prompt: j.prompt,
      skills: [], skill: null, model, provider, base_url: null, script: null,
      schedule: { kind: "cron", expr: j.schedule, display: j.schedule },
      enabled: j.enabled, deliver: j.deliver,
    };
  });
  return JSON.stringify({ jobs: mapped }, null, 2) + "\n";
}
