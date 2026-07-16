import { execFile } from "node:child_process";

export interface GitResult {
  code: number;
  stdout: Buffer;
  stderr: string;
}

export type GitRunner = (
  args: string[],
  options: { cwd?: string; timeoutMs: number },
) => Promise<GitResult>;

export const realGitRunner: GitRunner = (args, options) => new Promise((resolve) => {
  execFile("git", args, {
    cwd: options.cwd,
    timeout: options.timeoutMs,
    encoding: null,
    maxBuffer: 32 * 1024 * 1024,
  }, (error, stdout, stderr) => resolve({
    code: error ? 1 : 0,
    stdout: Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout ?? ""),
    stderr: Buffer.isBuffer(stderr) ? stderr.toString("utf8") : String(stderr ?? ""),
  }));
});
