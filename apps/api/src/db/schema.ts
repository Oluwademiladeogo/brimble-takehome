import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const deployments = sqliteTable("deployments", {
  id: text("id").primaryKey(),
  sourceType: text("source_type").notNull(),
  sourceRef: text("source_ref").notNull(),
  commitSha: text("commit_sha"),
  status: text("status").notNull(),
  imageTag: text("image_tag"),
  containerId: text("container_id"),
  hostPort: integer("host_port"),
  containerPort: integer("container_port"),
  routePath: text("route_path").notNull(),
  error: text("error"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const deploymentLogs = sqliteTable(
  "deployment_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    deploymentId: text("deployment_id").notNull(),
    ts: integer("ts").notNull(),
    stream: text("stream").notNull(),
    phase: text("phase").notNull(),
    line: text("line").notNull(),
  },
  (t) => ({
    byDeployment: index("idx_logs_by_deployment").on(t.deploymentId, t.id),
  })
);

export type Deployment = typeof deployments.$inferSelect;
export type NewDeployment = typeof deployments.$inferInsert;
export type DeploymentLog = typeof deploymentLogs.$inferSelect;
