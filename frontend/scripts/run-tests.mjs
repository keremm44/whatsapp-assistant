import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function discoverTestFiles(rootDir) {
  const testFiles = [];

  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(directory, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
        testFiles.push(fullPath);
      }
    }
  }

  await walk(rootDir);
  return testFiles.sort();
}

async function run() {
  const scriptsDir = dirname(fileURLToPath(import.meta.url));
  const frontendRoot = resolve(scriptsDir, "..");
  const srcRoot = join(frontendRoot, "src");
  const testFiles = await discoverTestFiles(srcRoot);

  if (testFiles.length === 0) {
    console.error("No *.test.ts files were discovered under src.");
    process.exitCode = 1;
    return;
  }

  console.log(`Discovered ${testFiles.length} frontend test files.`);

  const exitCode = await new Promise((resolveExitCode, reject) => {
    const child = spawn(
      process.execPath,
      ["--experimental-strip-types", "--test", ...testFiles],
      {
        cwd: frontendRoot,
        stdio: "inherit",
      },
    );

    child.once("error", reject);
    child.once("exit", (code) => resolveExitCode(code ?? 1));
  });

  process.exitCode = exitCode;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;

if (invokedPath === import.meta.url) {
  await run();
}
