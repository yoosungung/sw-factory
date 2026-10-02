import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const launchEnv = path.join(repoRoot, "scripts/macos/launch-env.sh");

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs.length = 0;
});

function tmp(): string {
  const d = mkdtempSync(path.join(tmpdir(), "zshrc-import-"));
  dirs.push(d);
  return d;
}

/** Fake zsh: `-i` sources ZDOTDIR/.zshrc, then evals the -c command (bash-compatible). */
function writeFakeZsh(dir: string, beforeEval = ""): string {
  const bin = path.join(dir, "zsh");
  writeFileSync(
    bin,
    `#!/usr/bin/env bash
interactive=0
cmd=""
args=("$@")
i=0
while [[ $i -lt \${#args[@]} ]]; do
  a="\${args[$i]}"
  if [[ "$a" == "-c" ]]; then
    cmd="\${args[$((i+1))]}"
    i=$((i+2))
    continue
  fi
  if [[ "$a" == -* && "$a" == *i* ]]; then
    interactive=1
  fi
  if [[ "$a" == -* && "$a" == *c* && "$a" != "-c" ]]; then
    cmd="\${args[$((i+1))]}"
    i=$((i+2))
    continue
  fi
  i=$((i+1))
done
if [[ "$interactive" == "1" ]]; then
  zdot="\${ZDOTDIR:-\$HOME}"
  if [[ -f "\$zdot/.zshrc" ]]; then
    # shellcheck disable=SC1090
    source "\$zdot/.zshrc"
  fi
fi
${beforeEval}
if [[ -n "\$cmd" ]]; then
  eval "\$cmd"
fi
`,
    "utf8",
  );
  chmodSync(bin, 0o755);
  return bin;
}

function run(
  home: string,
  script: string,
  extra: Record<string, string> = {},
): { status: number; stdout: string; stderr: string } {
  const result = spawnSync("bash", ["-c", script], {
    encoding: "utf8",
    env: {
      PATH: "/usr/bin:/bin",
      HOME: home,
      ZDOTDIR: home,
      TMPDIR: tmpdir(),
      SWF_ZSH_BIN: extra.SWF_ZSH_BIN ?? "",
      SWF_LAUNCHD_PATH: extra.SWF_LAUNCHD_PATH ?? "/opt/node/bin",
      SWF_ZSHRC_IMPORT_TIMEOUT: extra.SWF_ZSHRC_IMPORT_TIMEOUT ?? "20",
      SWF_IMPORT_ZSHRC: extra.SWF_IMPORT_ZSHRC ?? "1",
    },
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

describe("LaunchAgent zshrc import", () => {
  it("loads exported zshrc vars, lets .env override, and prefixes SWF_LAUNCHD_PATH", () => {
    const home = tmp();
    const zsh = writeFakeZsh(home);
    writeFileSync(
      path.join(home, ".zshrc"),
      [
        "echo banner-from-zshrc",
        "export ANDROID_HOME='/sdks/android'",
        "export ANDROID_SDK_ROOT='/opt/my sdk'",
        "export NDK_FLAGS='a=b'",
        'export PATH="/sdks/android/platform-tools:$PATH"',
        "export CURSOR_API_KEY=from-zshrc",
        "",
      ].join("\n"),
      "utf8",
    );
    const envFile = path.join(home, ".env");
    writeFileSync(envFile, "CURSOR_API_KEY=from-env\n", "utf8");

    const result = run(
      home,
      `
        set -euo pipefail
        source ${JSON.stringify(launchEnv)}
        load_launch_env ${JSON.stringify(envFile)}
        printf 'ANDROID_HOME=%s\\n' "\${ANDROID_HOME-}"
        printf 'ANDROID_SDK_ROOT=%s\\n' "\${ANDROID_SDK_ROOT-}"
        printf 'NDK_FLAGS=%s\\n' "\${NDK_FLAGS-}"
        printf 'CURSOR_API_KEY=%s\\n' "\${CURSOR_API_KEY-}"
        printf 'PATH=%s\\n' "\$PATH"
      `,
      { SWF_ZSH_BIN: zsh },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("banner-from-zshrc");
    expect(result.stdout).toContain("ANDROID_HOME=/sdks/android\n");
    expect(result.stdout).toContain("ANDROID_SDK_ROOT=/opt/my sdk\n");
    expect(result.stdout).toContain("NDK_FLAGS=a=b\n");
    expect(result.stdout).toContain("CURSOR_API_KEY=from-env\n");
    const pathLine = result.stdout.split("\n").find((l) => l.startsWith("PATH=")) ?? "";
    expect(pathLine.startsWith("PATH=/opt/node/bin:")).toBe(true);
    expect(pathLine).toContain("/sdks/android/platform-tools");
  });

  it("continues when zshrc is missing or the import is disabled", () => {
    const home = tmp();
    const zsh = writeFakeZsh(home);
    const script = `
      set -euo pipefail
      source ${JSON.stringify(launchEnv)}
      load_launch_env
      printf 'ANDROID_HOME=%s\\n' "\${ANDROID_HOME-}"
      printf 'PATH=%s\\n' "\$PATH"
    `;

    const missing = run(home, script, { SWF_ZSH_BIN: zsh });
    expect(missing.status).toBe(0);
    expect(missing.stdout).toContain("ANDROID_HOME=\n");
    expect(missing.stdout).toContain("PATH=/opt/node/bin:");

    writeFileSync(path.join(home, ".zshrc"), "export ANDROID_HOME=/sdks/android\n", "utf8");
    const disabled = run(home, script, { SWF_ZSH_BIN: zsh, SWF_IMPORT_ZSHRC: "0" });
    expect(disabled.status).toBe(0);
    expect(disabled.stdout).toContain("ANDROID_HOME=\n");
  });

  it("keeps going when zshrc import fails or times out", () => {
    const home = tmp();
    writeFileSync(path.join(home, ".zshrc"), "export ANDROID_HOME=/sdks/android\n", "utf8");
    const script = `
      set -euo pipefail
      source ${JSON.stringify(launchEnv)}
      load_launch_env
      printf 'ANDROID_HOME=%s\\n' "\${ANDROID_HOME-}"
    `;

    const failBin = path.join(tmp(), "zsh");
    writeFileSync(failBin, "#!/usr/bin/env bash\nexit 1\n", "utf8");
    chmodSync(failBin, 0o755);
    const failed = run(home, script, { SWF_ZSH_BIN: failBin });
    expect(failed.status).toBe(0);
    expect(failed.stderr).toMatch(/zshrc/);
    expect(failed.stdout).toContain("ANDROID_HOME=\n");

    const slow = writeFakeZsh(tmp(), "sleep 30\n");
    const timed = run(home, script, { SWF_ZSH_BIN: slow, SWF_ZSHRC_IMPORT_TIMEOUT: "1" });
    expect(timed.status).toBe(0);
    expect(timed.stderr).toMatch(/timed out/);
    expect(timed.stdout).toContain("ANDROID_HOME=\n");
  });

  it("wires every LaunchAgent entry through load_launch_env", () => {
    for (const name of ["run-cursor.sh", "run-gateway.sh", "watch-git-head.sh"]) {
      const text = spawnSync("cat", [path.join(repoRoot, "scripts/macos", name)], {
        encoding: "utf8",
      }).stdout;
      expect(text).toContain("launch-env.sh");
      expect(text).toContain("load_launch_env");
      expect(text).not.toContain("SWF_LAUNCHD_PATH:-");
    }
  });
});
