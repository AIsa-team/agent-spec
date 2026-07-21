import { describe, it, expect } from "vitest";
import { buildHermesCronJobs, HERMES_CRON_NOTE } from "../src/adapters/hermes/cron.js";

describe("buildHermesCronJobs", () => {
  it("appends the hermes runtime note to every prompt", () => {
    const out = JSON.parse(buildHermesCronJobs([
      { id: "a", schedule: "0 9 * * *", prompt: "do x", model: null, deliver: "origin", enabled: true },
    ]));
    expect(out.jobs[0].prompt).toBe("do x" + HERMES_CRON_NOTE);
    expect(HERMES_CRON_NOTE).toContain("default_api.execute_code");
  });

  it("maps agnostic jobs to hermes jobs.json shape", () => {
    const text = buildHermesCronJobs([
      { id: "push", schedule: "0 10 * * 1-5", prompt: "run push", model: null, deliver: "origin", enabled: true },
      { id: "daily", schedule: "5 18 * * 1-5", prompt: "decide", model: "default", deliver: "origin", enabled: true },
      { id: "lit", schedule: "0 0 * * *", prompt: "p", model: "gpt-4.1", deliver: "origin", enabled: false },
    ]);
    const parsed = JSON.parse(text);
    expect(parsed.jobs).toHaveLength(3);
    const [push, daily, lit] = parsed.jobs;
    expect(push).toMatchObject({
      id: "push", name: "push", model: null, provider: null,
      schedule: { kind: "cron", expr: "0 10 * * 1-5", display: "0 10 * * 1-5" },
      skills: [], skill: null, script: null, base_url: null,
      deliver: "origin", enabled: true,
    });
    expect(daily.model).toBe("{{MODEL_DEFAULT}}");
    expect(daily.provider).toBe("{{MODEL_PROVIDER}}");
    expect(lit.model).toBe("gpt-4.1");
    expect(lit.provider).toBe(null);
    expect(lit.enabled).toBe(false);
  });
});
