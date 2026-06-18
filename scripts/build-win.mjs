// Build the Windows NSIS installer reliably.
//
// electron-builder renames a populated `win-unpacked` dir during packaging, and a filesystem
// filter driver on the project tree (C:\Users\aaron\Claude\Projects) denies that rename with
// EPERM. Building to a temp dir OUTSIDE that tree avoids it; we then copy the installer back
// into ./release so the artifact lives where everything expects it.
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(tmpdir(), "rcsprint-release");
rmSync(out, { recursive: true, force: true });

execSync(`npx electron-builder --win nsis -c.directories.output="${out}"`, { stdio: "inherit" });

mkdirSync("release", { recursive: true });
let copied = 0;
for (const f of readdirSync(out)) {
  if (f.endsWith(".exe") || f.endsWith(".blockmap")) {
    cpSync(join(out, f), join("release", f));
    copied++;
  }
}
console.log(`build-win: copied ${copied} file(s) to ./release`);
