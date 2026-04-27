import Docker from "dockerode";
import { config } from "../config.js";

// Dockerode uses the UNIX socket by default. We mount /var/run/docker.sock
// from the host into the api container (see compose). If this path isn't
// available the ping in `assertDockerReachable` fails loud at startup.
export const docker = new Docker({ socketPath: "/var/run/docker.sock" });

export async function assertDockerReachable(): Promise<void> {
  // dockerode's ping resolves a minimal GET /_ping. Friendlier than a
  // container-create failing 20s into a build.
  try {
    await docker.ping();
  } catch (err) {
    throw new Error(
      `Docker daemon not reachable at /var/run/docker.sock: ${(err as Error).message}. ` +
        "Is the socket mounted into this container?"
    );
  }
}

export async function imageExists(tag: string): Promise<boolean> {
  try {
    await docker.getImage(tag).inspect();
    return true;
  } catch {
    return false;
  }
}

export async function imageExposedPort(tag: string): Promise<number | null> {
  try {
    const info = await docker.getImage(tag).inspect();
    const exposed = info.Config?.ExposedPorts;
    if (!exposed) return null;
    for (const key of Object.keys(exposed)) {
      // key looks like "3000/tcp"
      const [port] = key.split("/");
      const n = Number(port);
      if (!Number.isNaN(n)) return n;
    }
    return null;
  } catch {
    return null;
  }
}

export interface RunSpec {
  deploymentId: string;
  imageTag: string;
  containerPort: number;
}

export async function runContainer({ deploymentId, imageTag, containerPort }: RunSpec) {
  const name = `deploy-${deploymentId}`;
  const container = await docker.createContainer({
    name,
    Image: imageTag,
    Labels: { "brimble.deployment": deploymentId },
    ExposedPorts: { [`${containerPort}/tcp`]: {} },
    HostConfig: {
      NetworkMode: config.deployNetwork,
      RestartPolicy: { Name: "unless-stopped" },
      // Per-deployment resource caps. A runaway app shouldn't eat the host.
      // Conservative defaults; override via env if a legit app needs more.
      Memory: Number(process.env.DEPLOY_MEM_BYTES ?? 512 * 1024 * 1024),
      PidsLimit: Number(process.env.DEPLOY_PIDS_LIMIT ?? 256),
    },
    Env: [`PORT=${containerPort}`],
  });
  await container.start();
  return { containerId: container.id, hostname: name };
}

export async function stopAndRemove(containerId: string) {
  const c = docker.getContainer(containerId);
  try {
    await c.stop({ t: 5 });
  } catch {
    // container may already be stopped
  }
  try {
    await c.remove({ force: true });
  } catch {
    // ignore — best effort cleanup
  }
}

// Remove by docker-given name. Used to reclaim orphaned names after an
// interrupted create (e.g. api crashed between create and DB write).
export async function removeByName(name: string) {
  try {
    const c = docker.getContainer(name);
    await c.remove({ force: true });
  } catch {
    // 404 is fine — nothing to clean
  }
}

// List all containers with our deployment label. Used at boot time to
// reconcile against the DB and kill orphans.
export async function listDeployContainers(): Promise<
  Array<{ id: string; name: string; deploymentId: string | undefined }>
> {
  const containers = await docker.listContainers({
    all: true,
    filters: { label: ["brimble.deployment"] },
  });
  return containers.map((c) => ({
    id: c.Id,
    name: c.Names?.[0]?.replace(/^\//, "") ?? "",
    deploymentId: c.Labels?.["brimble.deployment"],
  }));
}
