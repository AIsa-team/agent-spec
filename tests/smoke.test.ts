import { describe, it, expect } from "vitest";
import { AGENTSPEC_VERSION } from "../src/index.js";

describe("smoke", () => {
  it("exports the spec version", () => {
    expect(AGENTSPEC_VERSION).toBe("agentspec/v1");
  });
});
