import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { PROJECT_TREE_IGNORED } from "../config.mjs";

export function getProjectTreeData(targetDir) {
  let entries = [];
  try {
    entries = fs.readdirSync(targetDir, { withFileTypes: true });
  } catch {
    return { rootPath: targetDir, totalDirs: 0, totalFiles: 0, tree: [] };
  }

  // Filtrar archivos ocultos (.*) y directorios pesados/ignorados
  const filtered = entries.filter((e) => !e.name.startsWith(".") && !PROJECT_TREE_IGNORED.has(e.name));

  filtered.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  let totalDirs = 0;
  let totalFiles = 0;

  const tree = [];
  for (const item of filtered) {
    if (item.isDirectory()) {
      totalDirs++;
      const subDirPath = path.join(targetDir, item.name);
      let subChildren = [];
      try {
        const subEntries = fs.readdirSync(subDirPath, { withFileTypes: true });
        const subFiltered = subEntries.filter((s) => !s.name.startsWith(".") && !PROJECT_TREE_IGNORED.has(s.name));
        subFiltered.sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1;
          if (!a.isDirectory() && b.isDirectory()) return 1;
          return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        });
        for (const s of subFiltered) {
          if (s.isDirectory()) totalDirs++;
          else totalFiles++;
          subChildren.push({
            name: s.name,
            isDir: s.isDirectory(),
          });
        }
      } catch {}

      tree.push({
        name: item.name,
        isDir: true,
        children: subChildren,
      });
    } else {
      totalFiles++;
      tree.push({
        name: item.name,
        isDir: false,
        children: [],
      });
    }
  }

  return {
    rootPath: targetDir,
    totalDirs,
    totalFiles,
    tree,
  };
}

export function openInFileExplorer(targetPath, onNotice = null) {
  try {
    const absPath = path.resolve(targetPath);
    if (process.platform === "win32") {
      const winPath = absPath.replace(/\//g, "\\");
      execFileSync("explorer.exe", [winPath], { stdio: "ignore" });
    } else if (process.platform === "darwin") {
      execFileSync("open", [absPath], { stdio: "ignore" });
    } else {
      execFileSync("xdg-open", [absPath], { stdio: "ignore" });
    }
    if (typeof onNotice === "function") {
      onNotice(`+ Abierto en explorador: ${path.basename(absPath)}`);
    }
  } catch (err) {
    if (typeof onNotice === "function") {
      onNotice(`! Error abriendo carpeta: ${err.message}`);
    }
  }
}
