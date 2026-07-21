import type { CronJob } from "../../schema/cron.js";

// 运行时专属措辞集中在 adapter(ADR-0008):源 prompt 保持中性,可复用于其他 target
export const HERMES_CRON_NOTE =
  "\n\n(Hermes 运行环境提示: 如需执行脚本,用 default_api.execute_code 运行并捕获 stdout;" +
  "本 cron 的输出由 Hermes gateway 原生投递到发起会话所在的通道 (deliver: origin),无需额外的发送脚本。)";

export function buildHermesCronJobs(jobs: CronJob[]): string {
  const mapped = jobs.map((j) => {
    let model: string | null = null;
    let provider: string | null = null;
    if (j.model === "default") { model = "{{MODEL_DEFAULT}}"; provider = "{{MODEL_PROVIDER}}"; }
    else if (j.model) { model = j.model; }
    return {
      id: j.id, name: j.id, prompt: j.prompt + HERMES_CRON_NOTE,
      skills: [], skill: null, model, provider, base_url: null, script: null,
      schedule: { kind: "cron", expr: j.schedule, display: j.schedule },
      enabled: j.enabled, deliver: j.deliver,
    };
  });
  return JSON.stringify({ jobs: mapped }, null, 2) + "\n";
}
