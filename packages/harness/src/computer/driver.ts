/**
 * Computer AI's hands and eyes (docs/23-computer-ai.md): screenshots, mouse and keyboard on the machine Aatmiq runs on.
 * - Windows: a small helper compiled once with the C# compiler Windows already has (nothing to install).
 * - Linux: an X11 display (DISPLAY) with xdotool and ImageMagick's import.
 *
 * Screenshots are scaled to at most 1280 px wide (JPEG); the model gives coordinates on that image and they are mapped
 * back to the screen here.
 */
import { execFile, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
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

/**
 * The Windows hands and eyes: a small program compiled once with the C# compiler every Windows has (.NET Framework's
 * csc.exe), then run for each action. Not a PowerShell script: Windows Defender's script scanner (AMSI) blocks a
 * screen-capturing script as malicious, which made every task fail with "didn't answer in time".
 *   screen                         → "W H"
 *   cursor                         → "X Y"
 *   shot <maxW> <grid 0|1> <norm 0|1> <out.jpg>  → "w h", the JPEG written to out.jpg
 *   move X Y | click X Y <left|right|middle> N | drag X1 Y1 X2 Y2 | scroll X Y N
 *   key VK[,VK…]                   (pressed in order, released in reverse)
 *   type <base64 UTF-8 text>       (typed as Unicode characters; a line break presses Enter)
 */
const HELPER_SOURCE = String.raw`
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

static class AatmiqScreen {
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern int GetSystemMetrics(int i);
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] static extern void mouse_event(uint f, uint dx, uint dy, int d, UIntPtr e);
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint f, UIntPtr e);
  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
  [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy; public uint data, flags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Explicit)] struct UNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public UNION u; }

  static int W() { return GetSystemMetrics(0); }
  static int H() { return GetSystemMetrics(1); }
  static int I(string s) { return (int)Math.Round(double.Parse(s, System.Globalization.CultureInfo.InvariantCulture)); }

  static void Unicode(char c) {
    var down = new INPUT { type = 1 }; down.u.ki = new KEYBDINPUT { wScan = c, dwFlags = 4 };
    var up = new INPUT { type = 1 }; up.u.ki = new KEYBDINPUT { wScan = c, dwFlags = 4 | 2 };
    SendInput(2, new[] { down, up }, Marshal.SizeOf(typeof(INPUT)));
  }

  static void Shot(int maxW, bool grid, bool norm, string path) {
    int sw = W(), sh = H();
    using (var bmp = new Bitmap(sw, sh)) {
      using (var g = Graphics.FromImage(bmp)) g.CopyFromScreen(0, 0, 0, 0, new Size(sw, sh));
      double s = Math.Min(1.0, (double)maxW / sw);
      int w = (int)Math.Round(sw * s), h = (int)Math.Round(sh * s);
      using (var outBmp = new Bitmap(w, h)) {
        using (var g = Graphics.FromImage(outBmp)) {
          g.InterpolationMode = InterpolationMode.HighQualityBicubic;
          g.DrawImage(bmp, 0, 0, w, h);
          if (grid) {
            using (var pen = new Pen(Color.FromArgb(70, 255, 0, 160), 1))
            using (var font = new Font("Arial", 8))
            using (var bg = new SolidBrush(Color.FromArgb(190, 255, 255, 255)))
            using (var fg = new SolidBrush(Color.FromArgb(255, 200, 0, 120))) {
              for (int k = 1; ; k++) {
                int x = norm ? (int)Math.Round(k * w / 10.0) : k * 100; if (norm ? k > 9 : x >= w) break;
                g.DrawLine(pen, x, 0, x, h); g.FillRectangle(bg, x + 1, 0, 26, 13); g.DrawString((k * 100).ToString(), font, fg, x + 1, 0);
              }
              for (int k = 1; ; k++) {
                int y = norm ? (int)Math.Round(k * h / 10.0) : k * 100; if (norm ? k > 9 : y >= h) break;
                g.DrawLine(pen, 0, y, w, y); g.FillRectangle(bg, 0, y + 1, 26, 13); g.DrawString((k * 100).ToString(), font, fg, 0, y + 1);
              }
            }
          }
        }
        ImageCodecInfo jpeg = null;
        foreach (var c in ImageCodecInfo.GetImageEncoders()) if (c.MimeType == "image/jpeg") jpeg = c;
        var p = new EncoderParameters(1);
        p.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 75L);
        outBmp.Save(path, jpeg, p);
        Console.Write(w + " " + h);
      }
    }
  }

  [STAThread]
  static int Main(string[] a) {
    try {
      SetProcessDPIAware();
      switch (a[0]) {
        case "screen": Console.Write(W() + " " + H()); break;
        case "cursor": { POINT p; GetCursorPos(out p); Console.Write(p.X + " " + p.Y); break; }
        case "shot": Shot(I(a[1]), a[2] == "1", a[3] == "1", a[4]); break;
        case "move": SetCursorPos(I(a[1]), I(a[2])); break;
        case "click": {
          uint dn = a[3] == "right" ? 8u : a[3] == "middle" ? 32u : 2u, upf = dn * 2;
          SetCursorPos(I(a[1]), I(a[2])); Thread.Sleep(60);
          for (int k = 0; k < I(a[4]); k++) { if (k > 0) Thread.Sleep(80); mouse_event(dn, 0, 0, 0, UIntPtr.Zero); mouse_event(upf, 0, 0, 0, UIntPtr.Zero); }
          break;
        }
        case "drag": {
          int x1 = I(a[1]), y1 = I(a[2]), x2 = I(a[3]), y2 = I(a[4]);
          SetCursorPos(x1, y1); mouse_event(2, 0, 0, 0, UIntPtr.Zero);
          for (int k = 1; k <= 12; k++) { SetCursorPos(x1 + (x2 - x1) * k / 12, y1 + (y2 - y1) * k / 12); Thread.Sleep(20); }
          mouse_event(4, 0, 0, 0, UIntPtr.Zero); break;
        }
        case "scroll": SetCursorPos(I(a[1]), I(a[2])); mouse_event(0x0800, 0, 0, -I(a[3]) * 120, UIntPtr.Zero); break;
        case "key": {
          var vks = a[1].Split(',');
          foreach (var v in vks) keybd_event((byte)int.Parse(v), 0, 0, UIntPtr.Zero);
          Thread.Sleep(40);
          for (int k = vks.Length - 1; k >= 0; k--) keybd_event((byte)int.Parse(vks[k]), 0, 2, UIntPtr.Zero);
          break;
        }
        case "type": {
          string text = Encoding.UTF8.GetString(Convert.FromBase64String(a[1])).Replace("\r\n", "\n");
          foreach (char c in text) {
            if (c == '\n') { keybd_event(0x0D, 0, 0, UIntPtr.Zero); keybd_event(0x0D, 0, 2, UIntPtr.Zero); }
            else Unicode(c);
            Thread.Sleep(8);
          }
          break;
        }
        default: Console.Error.Write("unknown command " + a[0]); return 2;
      }
      return 0;
    } catch (Exception e) {
      Console.Error.Write(e.Message);
      return 1;
    }
  }
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

/** .NET Framework's C# compiler, present on every Windows 10 and 11. */
function cscPath(): string | null {
  const root = process.env.WINDIR ?? process.env.SystemRoot ?? "C:\\Windows";
  for (const fw of ["Framework64", "Framework"]) {
    const p = join(root, "Microsoft.NET", fw, "v4.0.30319", "csc.exe");
    if (existsSync(p)) return p;
  }
  return null;
}

const runHelper = (file: string, args: string[], timeoutMs = 30_000) =>
  new Promise<string>((resolve, reject) => {
    execFile(file, args, { windowsHide: true, timeout: timeoutMs, maxBuffer: 1 << 20 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${String(stderr || stdout || err.message).replace(/\s+/g, " ").trim().slice(0, 400)}`));
      else resolve(String(stdout).trim());
    });
  });

class WindowsDriver implements Driver {
  private exe: string;
  private ready: Promise<void> | null = null;

  constructor() {
    // One helper per version of its source, shared by every task on this machine.
    this.exe = join(tmpdir(), `aatmiq-screen-${createHash("sha1").update(HELPER_SOURCE).digest("hex").slice(0, 10)}.exe`);
  }

  /** The helper, compiled on first use (a second or two). */
  private prepare(): Promise<void> {
    this.ready ??= (async () => {
      if (existsSync(this.exe)) return;
      const csc = cscPath();
      if (!csc) throw new Error("The C# compiler (.NET Framework 4, csc.exe) isn't on this Windows, so the screen can't be used.");
      const src = join(tmpdir(), `aatmiq-screen-${process.pid}.cs`);
      await writeFile(src, HELPER_SOURCE);
      const tmp = `${this.exe}.${process.pid}.tmp`;
      try {
        await runHelper(csc, ["/nologo", "/optimize", "/target:exe", "/platform:anycpu", "/r:System.Drawing.dll", `/out:${tmp}`, src], 120_000);
        await rename(tmp, this.exe).catch(async () => {
          // Another task compiled it at the same time: theirs is used.
          if (!existsSync(this.exe)) throw new Error("Couldn't save the screen helper.");
          await rm(tmp, { force: true });
        });
      } catch (e) {
        throw new Error(`Couldn't build the screen helper: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        await rm(src, { force: true });
      }
    })().catch((e) => {
      this.ready = null;
      throw e;
    });
    return this.ready;
  }

  private async exec(...args: (string | number)[]) {
    await this.prepare();
    try {
      return await runHelper(this.exe, args.map(String));
    } catch (e) {
      throw new Error(`The screen command failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private pair(s: string) {
    const [a, b] = s.split(/\s+/).map(Number);
    return [a!, b!] as const;
  }

  async screen() {
    const [width, height] = this.pair(await this.exec("screen"));
    return { width, height };
  }
  async screenshot(): Promise<Shot> {
    const file = join(tmpdir(), `aatmiq-shot-${process.pid}-${Date.now()}.jpg`);
    try {
      const [width, height] = this.pair(await this.exec("shot", MAX_SHOT_WIDTH, GRID ? 1 : 0, COORDS === "normalized" ? 1 : 0, file));
      return { image: await readFile(file), width, height };
    } finally {
      await rm(file, { force: true });
    }
  }
  async cursor() {
    const [x, y] = this.pair(await this.exec("cursor"));
    return { x, y };
  }
  async move(x: number, y: number) {
    await this.exec("move", Math.round(x), Math.round(y));
  }
  async click(x: number, y: number, button: "left" | "right" | "middle", count: number) {
    await this.exec("click", Math.round(x), Math.round(y), button, count);
  }
  async drag(x1: number, y1: number, x2: number, y2: number) {
    await this.exec("drag", Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2));
  }
  async type(text: string) {
    await this.exec("type", Buffer.from(text, "utf8").toString("base64"));
  }
  async key(keys: string) {
    await this.exec("key", windowsKeys(keys).join(","));
  }
  async scroll(x: number, y: number, amount: number) {
    await this.exec("scroll", Math.round(x), Math.round(y), Math.round(amount));
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

