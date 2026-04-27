export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? "./data/app.db",
  caddyAdmin: process.env.CADDY_ADMIN ?? "http://localhost:2019",
  workspaceDir: process.env.WORKSPACE_DIR ?? "./data/workspaces",
  logsDir: process.env.LOGS_DIR ?? "./data/logs",
  deployNetwork: process.env.DEPLOY_NETWORK ?? "brimble-net",
  imageNamespace: process.env.IMAGE_NAMESPACE ?? "brimble-deploy",
  publicHost: process.env.PUBLIC_HOST ?? "http://localhost",
  // Fallback container port when Railpack metadata doesn't expose one.
  fallbackContainerPort: Number(process.env.FALLBACK_CONTAINER_PORT ?? 3000),
};
