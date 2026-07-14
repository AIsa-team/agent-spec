import { z } from "zod";
import { parse as parseYaml } from "yaml";
import { AgentSpecError } from "./manifest.js";

// 5 空格分隔字段,每段为 cron 常见令牌(数字/范围/步进/列表/*)
const cronExpr = z.string().regex(
  /^(\S+\s+){4}\S+$/,
  "schedule must be a 5-field cron expression",
);

const cronJobSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  schedule: cronExpr,
  prompt: z.string().min(1),
  model: z.string().nullable().default(null),
  deliver: z.literal("origin").default("origin"),
  enabled: z.boolean().default(true),
});

const cronFileSchema = z.object({ jobs: z.array(cronJobSchema).default([]) });

export type CronJob = z.infer<typeof cronJobSchema>;

export function parseCronJobs(yamlText: string): CronJob[] {
  let raw: unknown;
  try {
    raw = parseYaml(yamlText);
  } catch (e) {
    throw new AgentSpecError(`cron jobs file is not valid YAML: ${(e as Error).message}`);
  }
  const result = cronFileSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new AgentSpecError(`cron jobs invalid: ${issues}`);
  }
  const jobs = result.data.jobs;
  const seen = new Set<string>();
  for (const j of jobs) {
    if (seen.has(j.id)) throw new AgentSpecError(`duplicate cron job id: ${j.id}`);
    seen.add(j.id);
  }
  return jobs;
}
