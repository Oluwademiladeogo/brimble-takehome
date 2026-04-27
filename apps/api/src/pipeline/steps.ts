import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import simpleGit from "simple-git";
import { config } from "../config.js";
import { runStreamed } from "../logs/stream.js";
import { logSystem } from "../logs/broker.js";

export async function clone(deploymentId: string, gitUrl: string): Promise<{ dir: string; sha: string }> {
  const dir = join(config.workspaceDir, deploymentId);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  logSystem(deploymentId, "clone", `[clone] git clone --depth 1 ${gitUrl}`);
  const git = simpleGit();
  await git.clone(gitUrl, dir, ["--depth", "1"]);
  const sha = (await simpleGit(dir).revparse(["HEAD"])).trim();
  logSystem(deploymentId, "clone", `[clone] HEAD = ${sha}`);
  return { dir, sha };
}

export async function railpackBuild(deploymentId: string, dir: string, imageTag: string): Promise<void> {
  logSystem(deploymentId, "build", `[build] railpack build --name ${imageTag}`);
  const code = await runStreamed({
    cmd: "railpack",
    args: ["build", dir, "--name", imageTag],
    deploymentId,
    phase: "build",
  });
  if (code !== 0) throw new Error(`railpack build exited with code ${code}`);
}
