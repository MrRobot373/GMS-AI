/**
 * Computer AI's hands and eyes (docs/23-computer-ai.md): screenshots, mouse and keyboard on the machine Aatmiq runs on.
 * - Windows: one PowerShell process per task (nothing to install): System.Drawing for screenshots, user32 for the mouse
 *   and keys, SendKeys for text.
 * - Linux: an X11 display (DISPLAY) with xdotool and ImageMagick's import.
 *
 * Screenshots are scaled to at most 1280 px wide (JPEG); the model gives coordinates on that image and they are mapped
 * back to the screen here.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface Shot {
  /** JPEG, scaled. */
  image: Buffer;
  width: number;
  height: number;
}

export interface Driver {
  /** The real screen size. */
  screen(): Promise<{ width: number; height: number }>;
  screenshot(): Promise<Shot>;
  cursor(): Promise<{ x: number; y: number }>;
  move(x: number, y: number): Promise<void>;
  click(x: number, y: number, button: "left" | "right" | "middle", count: number): Promise<void>;
  drag(x1: number, y1: number, x2: number, y2: number): Promise<void>;
  type(text: string): Promise<void>;
  /** Keys like "ctrl+c", "enter", "win", "alt+tab". */
  key(keys: string): Promise<void>;
  scroll(x: number, y: number, amount: number): Promise<void>;
  close(): void;
}

export const MAX_SHOT_WIDTH = 1280;
/** A faint grid with labels on each screenshot: models place clicks far better with it. */
const GRID = process.env.AATMIQ_COMPUTER_GRID !== "off";
/**
 * How the model gives positions: "normalized", 0-1000 across and down whatever the image size (Qwen3-VL, Gemma,
 * Nemotron and most current vision models), or "pixels" of the screenshot (Qwen2.5-VL). The grid is labelled to match.
 */
export const COORDS: "normalized" | "pixels" = process.env.AATMIQ_COMPUTER_COORDS === "pixels" ? "pixels" : "normalized";
/** The grid lines: where they are on the image, and their labels. */
export function gridLines(size: number): { at: number; label: number }[] {
  if (COORDS === "pixels") return Array.from({ length: Math.ceil(size / 100) - 1 }, (_, i) => ({ at: (i + 1) * 100, label: (i + 1) * 100 }));
  return Array.from({ length: 9 }, (_, i) => ({ at: Math.round(((i + 1) * size) / 10), label: (i + 1) * 100 }));
}

const which = (cmd: string) => spawnSync(process.platform === "win32" ? "where" : "which", [cmd], { stdio: "ignore" }).status === 0;

/** Whether this machine can be controlled: Windows, or Linux with a display and the tools. */
export function computerSupport(): { ok: true } | { ok: false; why: string } {
  if (process.platform === "win32") return { ok: true };
  if (process.platform === "linux") {
    if (!process.env.DISPLAY) return { ok: false, why: "No desktop to control: the API isn't running in a desktop session (DISPLAY isn't set)." };
    for (const t of ["xdotool", "import", "convert"]) if (!which(t)) return { ok: false, why: `The ${t} program isn't installed (apt install xdotool imagemagick).` };
    return { ok: true };
  }
  return { ok: false, why: "Computer AI works on Windows and on Linux desktops." };
}

export function createDriver(): Driver {
  if (process.platform === "win32") return new WindowsDriver();
  return new X11Driver();
}

/* ───────────── Windows ───────────── */

const psString = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** The mouse and keyboard calls (user32), compiled once into a DLL next to the task's files. */
const INPUT_TYPE = `using System; using System.Runtime.InteropServices;
public static class AatmiqInput {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, int d, UIntPtr e);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint f, UIntPtr e);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}`;

/** What every run starts with: the .NET parts, the helper DLL, and the screen in real pixels (not scaled by DPI). */
const psPrelude = (dll: string) => `$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -Path ${psString(dll)}
[AatmiqInput]::SetProcessDPIAware() | Out-Null
`;

const PS_SHOT = `function Aatmiq-Shot($maxW, $grid, $norm) {
  $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($b.X, $b.Y, 0, 0, $bmp.Size)
  $s = [Math]::Min(1.0, $maxW / $b.Width)
  $w = [int]($b.Width * $s); $h = [int]($b.Height * $s)
  $out = New-Object System.Drawing.Bitmap $w, $h
  $g2 = [System.Drawing.Graphics]::FromImage($out)
  $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g2.DrawImage($bmp, 0, 0, $w, $h)
  if ($grid) {
    $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(70, 255, 0, 160)), 1
    $font = New-Object System.Drawing.Font 'Arial', 9
    $bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(190, 255, 255, 255))
    $fg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 200, 0, 120))
    if ($norm) { $xs = 1..9 | ForEach-Object { ,@([int]($_ * $w / 10), ($_ * 100)) }; $ys = 1..9 | ForEach-Object { ,@([int]($_ * $h / 10), ($_ * 100)) } }
    else { $xs = for ($x = 100; $x -lt $w; $x += 100) { ,@($x, $x) }; $ys = for ($y = 100; $y -lt $h; $y += 100) { ,@($y, $y) } }
    foreach ($p in $xs) { $x = $p[0]; $g2.DrawLine($pen, $x, 0, $x, $h); $g2.FillRectangle($bg, $x + 1, 0, 26, 13); $g2.DrawString("$($p[1])", $font, $fg, $x + 1, 0) }
    foreach ($p in $ys) { $y = $p[0]; $g2.DrawLine($pen, 0, $y, $w, $y); $g2.FillRectangle($bg, 0, $y + 1, 26, 13); $g2.DrawString("$($p[1])", $font, $fg, 0, $y + 1) }
  }
  $enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
  $p = New-Object System.Drawing.Imaging.EncoderParameters 1
  $p.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 75L
  $ms = New-Object System.IO.MemoryStream
  $out.Save($ms, $enc, $p)
  $g.Dispose(); $g2.Dispose(); $bmp.Dispose(); $out.Dispose()
  "$w $h " + [Convert]::ToBase64String($ms.ToArray())
}
`;

/** Windows virtual-key codes for key names. */
const VK: Record<string, number> = {
  ctrl: 0x11, control: 0x11, alt: 0x12, shift: 0x10, win: 0x5b, windows: 0x5b, cmd: 0x5b, super: 0x5b, meta: 0x5b,
  enter: 0x0d, return: 0x0d, tab: 0x09, esc: 0x1b, escape: 0x1b, backspace: 0x08, delete: 0x2e, del: 0x2e, insert: 0x2d,
  home: 0x24, end: 0x23, pageup: 0x21, pagedown: 0x22, up: 0x26, down: 0x28, left: 0x25, right: 0x27, space: 0x20,
  capslock: 0x14, printscreen: 0x2c, menu: 0x5d,
};
for (let i = 1; i <= 12; i++) VK[`f${i}`] = 0x6f + i;

/** The virtual-key codes for "ctrl+shift+s" (unknown names throw). */
export function windowsKeys(keys: string): number[] {
  return keys
    .toLowerCase()
    .split("+")
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k) => {
      if (VK[k] !== undefined) return VK[k]!;
      if (/^[a-z0-9]$/.test(k)) return k.toUpperCase().charCodeAt(0);
      throw new Error(`Unknown key "${k}".`);
    });
}

/** Text as SendKeys reads it: its special characters in braces. */
export const sendKeysText = (text: string) => text.replace(/[+^%~(){}[\]]/g, (c) => `{${c}}`).replace(/\r?\n/g, "{ENTER}");


class WindowsDriver implements Driver {
  private dll: string;
  private ready: Promise<void> | null = null;

  constructor() {
    this.dll = join(tmpdir(), `aatmiq-input-${process.pid}.dll`);
  }

  /** Run one PowerShell script and return what it printed. Each action is its own short run: nothing is left waiting. */
  private ps(script: string, timeoutMs = 30_000): Promise<string> {
    return new Promise((resolve, reject) => {
      const encoded = Buffer.from(script, "utf16le").toString("base64");
      const child = spawn("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
      let out = "";
      let err = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (d: string) => (out += d));
      child.stderr.on("data", (d: string) => (err = (err + d).slice(-2000)));
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("The computer didn't answer in time (PowerShell took longer than 30 seconds)."));
      }, timeoutMs);
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(new Error(`PowerShell couldn't start: ${e.message}`));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve(out.trim());
        else reject(new Error(`The screen command failed: ${(err || out).replace(/\s+/g, " ").trim().slice(0, 300)}`));
      });
    });
  }

  /** The helper DLL, compiled on first use (a few seconds), then loaded by every run. */
  private prepare(): Promise<void> {
    this.ready ??= (async () => {
      if (existsSync(this.dll)) return;
      await this.ps(`Add-Type -TypeDefinition @"\n${INPUT_TYPE}\n"@ -OutputAssembly ${psString(this.dll)} -OutputType Library`, 120_000);
    })().catch((e) => {
      this.ready = null;
      throw e;
    });
    return this.ready;
  }

  private async exec(script: string) {
    await this.prepare();
    return this.ps(`${psPrelude(this.dll)}${script}`);
  }

  async screen() {
    const [w, h] = (await this.exec("$b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; \"$($b.Width) $($b.Height)\"")).split(" ").map(Number);
    return { width: w!, height: h! };
  }
  async screenshot(): Promise<Shot> {
    const [w, h, b64] = (await this.exec(`${PS_SHOT}\nAatmiq-Shot ${MAX_SHOT_WIDTH} $${GRID ? "true" : "false"} $${COORDS === "normalized" ? "true" : "false"}`)).split(" ");
    return { image: Buffer.from(b64 ?? "", "base64"), width: Number(w), height: Number(h) };
  }
  async cursor() {
    const [x, y] = (await this.exec('$p=[System.Windows.Forms.Cursor]::Position; "$($p.X) $($p.Y)"')).split(" ").map(Number);
    return { x: x!, y: y! };
  }
  async move(x: number, y: number) {
    await this.exec(`[AatmiqInput]::SetCursorPos(${Math.round(x)}, ${Math.round(y)}) | Out-Null`);
  }
  async click(x: number, y: number, button: "left" | "right" | "middle", count: number) {
    const [down, up] = button === "right" ? [0x08, 0x10] : button === "middle" ? [0x20, 0x40] : [0x02, 0x04];
    const one = `[AatmiqInput]::mouse_event(${down},0,0,0,[UIntPtr]::Zero); [AatmiqInput]::mouse_event(${up},0,0,0,[UIntPtr]::Zero)`;
    await this.exec(`[AatmiqInput]::SetCursorPos(${Math.round(x)}, ${Math.round(y)}) | Out-Null; Start-Sleep -Milliseconds 60; ${Array(count).fill(one).join("; Start-Sleep -Milliseconds 80; ")}`);
  }
  async drag(x1: number, y1: number, x2: number, y2: number) {
    const steps = 12;
    const moves = Array.from({ length: steps }, (_, i) => `[AatmiqInput]::SetCursorPos(${Math.round(x1 + ((x2 - x1) * (i + 1)) / steps)}, ${Math.round(y1 + ((y2 - y1) * (i + 1)) / steps)}) | Out-Null; Start-Sleep -Milliseconds 20`).join("; ");
    await this.exec(`[AatmiqInput]::SetCursorPos(${Math.round(x1)}, ${Math.round(y1)}) | Out-Null; [AatmiqInput]::mouse_event(2,0,0,0,[UIntPtr]::Zero); ${moves}; [AatmiqInput]::mouse_event(4,0,0,0,[UIntPtr]::Zero)`);
  }
  async type(text: string) {
    await this.exec(`[System.Windows.Forms.SendKeys]::SendWait(${psString(sendKeysText(text))})`);
  }
  async key(keys: string) {
    const vks = windowsKeys(keys);
    const down = vks.map((k) => `[AatmiqInput]::keybd_event(${k},0,0,[UIntPtr]::Zero)`);
    const up = [...vks].reverse().map((k) => `[AatmiqInput]::keybd_event(${k},0,2,[UIntPtr]::Zero)`);
    await this.exec([...down, "Start-Sleep -Milliseconds 40", ...up].join("; "));
  }
  async scroll(x: number, y: number, amount: number) {
    await this.exec(`[AatmiqInput]::SetCursorPos(${Math.round(x)}, ${Math.round(y)}) | Out-Null; [AatmiqInput]::mouse_event(0x0800,0,0,${Math.round(-amount * 120)},[UIntPtr]::Zero)`);
  }
  close() {}

}

/* ───────────── Linux (X11) ───────────── */

/** xdotool's names for key names. */
const X_KEYS: Record<string, string> = {
  enter: "Return", return: "Return", tab: "Tab", esc: "Escape", escape: "Escape", backspace: "BackSpace", delete: "Delete", del: "Delete",
  insert: "Insert", home: "Home", end: "End", pageup: "Prior", pagedown: "Next", up: "Up", down: "Down", left: "Left", right: "Right",
  space: "space", win: "super", windows: "super", cmd: "super", meta: "super", control: "ctrl", capslock: "Caps_Lock", menu: "Menu",
};
export const xdotoolKeys = (keys: string) =>
  keys
    .toLowerCase()
    .split("+")
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k) => X_KEYS[k] ?? (/^f\d{1,2}$/.test(k) ? k.toUpperCase() : k))
    .join("+");

function run(cmd: string, args: string[], input?: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    let err = "";
    p.stdout.on("data", (d) => out.push(d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`${cmd} failed: ${err.trim().slice(0, 300)}`))));
    p.stdin.end(input ?? "");
  });
}

class X11Driver implements Driver {
  async screen() {
    const [w, h] = (await run("xdotool", ["getdisplaygeometry"])).toString().trim().split(/\s+/).map(Number);
    return { width: w!, height: h! };
  }
  async screenshot(): Promise<Shot> {
    const { width, height } = await this.screen();
    const s = Math.min(1, MAX_SHOT_WIDTH / width);
    const w = Math.round(width * s);
    const h = Math.round(height * s);
    const raw = await run("import", ["-silent", "-window", "root", "-resize", `${w}x${h}!`, "png:-"]);
    const draw: string[] = [];
    if (GRID) {
      for (const { at: x, label } of gridLines(w)) draw.push("-stroke", "rgba(255,0,160,0.28)", "-draw", `line ${x},0 ${x},${h}`, "-stroke", "none", "-fill", "rgba(255,255,255,0.75)", "-draw", `rectangle ${x + 1},0 ${x + 27},13`, "-fill", "rgb(200,0,120)", "-draw", `text ${x + 2},11 '${label}'`);
      for (const { at: y, label } of gridLines(h)) draw.push("-stroke", "rgba(255,0,160,0.28)", "-draw", `line 0,${y} ${w},${y}`, "-stroke", "none", "-fill", "rgba(255,255,255,0.75)", "-draw", `rectangle 0,${y + 1} 26,${y + 14}`, "-fill", "rgb(200,0,120)", "-draw", `text 1,${y + 12} '${label}'`);
    }
    const image = await run("convert", ["png:-", "-pointsize", "10", ...draw, "-quality", "75", "jpg:-"], raw);
    return { image, width: w, height: h };
  }
  async cursor() {
    const out = (await run("xdotool", ["getmouselocation", "--shell"])).toString();
    return { x: Number(/X=(\d+)/.exec(out)?.[1] ?? 0), y: Number(/Y=(\d+)/.exec(out)?.[1] ?? 0) };
  }
  async move(x: number, y: number) {
    await run("xdotool", ["mousemove", String(Math.round(x)), String(Math.round(y))]);
  }
  async click(x: number, y: number, button: "left" | "right" | "middle", count: number) {
    await run("xdotool", ["mousemove", String(Math.round(x)), String(Math.round(y)), "click", "--repeat", String(count), "--delay", "80", button === "right" ? "3" : button === "middle" ? "2" : "1"]);
  }
  async drag(x1: number, y1: number, x2: number, y2: number) {
    await run("xdotool", ["mousemove", String(Math.round(x1)), String(Math.round(y1)), "mousedown", "1", "mousemove", "--sync", String(Math.round(x2)), String(Math.round(y2)), "mouseup", "1"]);
  }
  async type(text: string) {
    await run("xdotool", ["type", "--delay", "15", "--", text]);
  }
  async key(keys: string) {
    await run("xdotool", ["key", "--", xdotoolKeys(keys)]);
  }
  async scroll(x: number, y: number, amount: number) {
    const n = Math.max(1, Math.round(Math.abs(amount)));
    await run("xdotool", ["mousemove", String(Math.round(x)), String(Math.round(y)), "click", "--repeat", String(n), amount > 0 ? "5" : "4"]);
  }
  close() {}
}

