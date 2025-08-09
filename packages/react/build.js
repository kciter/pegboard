const esbuild = require("esbuild");
const { execSync } = require("child_process");
const { rmSync, mkdirSync, existsSync } = require("fs");
const path = require("path");

const isWatch = process.argv.includes("--watch");
const isProd = process.env.NODE_ENV === "production";

function clean() {
  rmSync("dist", { recursive: true, force: true });
  mkdirSync("dist", { recursive: true });
}

function buildTypes() {
  execSync("tsc --emitDeclarationOnly --declaration --declarationMap", {
    stdio: "inherit",
  });
}

const banner = {
  js: `/**\n * Pegboard React Build\n * Generated: ${new Date().toISOString()}\n */\n`,
};

const baseConfig = {
  entryPoints: ["src/index.ts"],
  bundle: true,
  sourcemap: true,
  target: "es2020",
  external: ["react", "react-dom", "@pegboard/core"],
  banner,
  metafile: true,
  minify: isProd,
};

const configs = [
  {
    ...baseConfig,
    format: "cjs",
    outfile: "dist/index.js",
    platform: "node",
  },
  {
    ...baseConfig,
    format: "esm",
    outfile: "dist/index.esm.js",
    platform: "neutral",
  },
];

async function waitForCoreTypes() {
  const coreTypes = path.resolve(__dirname, "../core/dist/index.d.ts");
  const start = Date.now();
  return new Promise((resolve) => {
    if (existsSync(coreTypes)) return resolve(true);
    const interval = setInterval(() => {
      if (existsSync(coreTypes)) {
        clearInterval(interval);
        resolve(true);
      }
      if (Date.now() - start > 15000) {
        clearInterval(interval);
        resolve(false);
      }
    }, 300);
  });
}

async function startWatch() {
  const ok = await waitForCoreTypes();
  if (!ok)
    console.warn("⚠️ core types not detected within timeout, continuing");
  const contexts = await Promise.all(configs.map((c) => esbuild.context(c)));
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.log("✅ React initial build complete. Watching...");
  const fs = require("fs");
  fs.watch("src", { recursive: true }, (evt, filename) => {
    if (!filename.endsWith(".ts") && !filename.endsWith(".tsx")) return;
    try {
      buildTypes();
    } catch (_) {
      /* ignore */
    }
  });
}

async function build() {
  try {
    clean();
    buildTypes();

    if (isWatch) {
      await startWatch();
    } else {
      const results = await Promise.all(
        configs.map((config) => esbuild.build(config))
      );
      results.forEach((r) => {
        if (r.metafile)
          console.log("📦 Outputs:", Object.keys(r.metafile.outputs));
      });
      console.log("✅ Build completed successfully");
    }
  } catch (error) {
    console.error("❌ Build failed (will not exit in watch):", error);
    if (!isWatch) process.exit(1);
  }
}

build();
