import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DatabaseSync } from "node:sqlite";
import { ENGRAM_DB_PATH } from "../config.mjs";

export function getEngramData(projectName, projectDir) {
  let canonicalName = projectName;

  try {
    const cfgPath = path.join(projectDir, ".engram", "config.json");
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
      if (cfg.project_name) canonicalName = cfg.project_name;
      else if (cfg.project) canonicalName = cfg.project;
    }
  } catch {}

  let cloudHost = null;
  const envCloud = process.env.ENGRAM_CLOUD_SERVER;
  if (envCloud) {
    try {
      cloudHost = new URL(envCloud).hostname;
    } catch {
      cloudHost = envCloud;
    }
  } else {
    try {
      const cloudJsonPath = path.join(os.homedir(), ".engram", "cloud.json");
      if (fs.existsSync(cloudJsonPath)) {
        const cloudData = JSON.parse(fs.readFileSync(cloudJsonPath, "utf8"));
        if (cloudData.server_url) {
          try {
            cloudHost = new URL(cloudData.server_url).hostname;
          } catch {
            cloudHost = cloudData.server_url;
          }
        }
      }
    } catch {}
  }

  const result = {
    project: canonicalName,
    online: false,
    obsCount: 0,
    enrolled: false,
    cloudHost,
  };

  try {
    if (fs.existsSync(ENGRAM_DB_PATH)) {
      result.online = true;
      const db = new DatabaseSync(ENGRAM_DB_PATH, { open: true, readOnly: true });
      db.exec("PRAGMA busy_timeout = 2000;");

      const obsRow = db.prepare("SELECT count(*) as count FROM observations WHERE project = ? AND deleted_at IS NULL").get(canonicalName);
      if (obsRow) result.obsCount = obsRow.count;

      const enrollRow = db.prepare("SELECT count(*) as count FROM sync_enrolled_projects WHERE project = ?").get(canonicalName);
      if (enrollRow && enrollRow.count > 0) result.enrolled = true;

      db.close();
    }
  } catch {}

  return result;
}
