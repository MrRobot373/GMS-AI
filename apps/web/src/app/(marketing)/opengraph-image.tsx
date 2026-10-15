import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/**
 * The preview when someone shares a link to the public site (only this page: it's in its own route
 * group, so customers' app pages never show Aatmiq's card). The art is generated
 * (scripts/generate-images.mjs); the words and the logo are drawn here.
 */
export const alt = "Aatmiq: your own AI. Nowhere else.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  // Literal paths, so the build traces just these files. Made at build time (a static route).
  const [art, serif, serifItalic] = await Promise.all([
    readFile(join(process.cwd(), "public/images/og/og-art.jpg")).catch(() => null),
    readFile(join(process.cwd(), "node_modules/@fontsource/newsreader/files/newsreader-latin-400-normal.woff")),
    readFile(join(process.cwd(), "node_modules/@fontsource/newsreader/files/newsreader-latin-400-italic.woff")),
  ]);
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: "#0f0f0f", position: "relative" }}>
        {art && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`data:image/jpeg;base64,${art.toString("base64")}`} alt="" width={1200} height={630} style={{ position: "absolute", inset: 0 }} />
        )}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 80px", width: 720 }}>
          <svg width="56" height="56" viewBox="0 0 32 32" fill="none">
            <rect x="1" y="1" width="30" height="30" rx="8" fill="#1f1f1f" stroke="#363636" />
            <path d="M10 24 L16 7.5 L22 24" stroke="#ededed" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="16" cy="18.2" r="2.4" fill="#22d3ee" />
          </svg>
          <div style={{ marginTop: 40, fontFamily: "Newsreader", fontSize: 92, lineHeight: 1, letterSpacing: "-0.03em", color: "#ededed" }}>Your own AI.</div>
          <div style={{ marginTop: 6, fontFamily: "Newsreader", fontStyle: "italic", fontSize: 92, lineHeight: 1, letterSpacing: "-0.03em", color: "#8c8c8c" }}>
            Nowhere else.
          </div>
          <div style={{ marginTop: 36, fontFamily: "Newsreader", fontSize: 30, color: "#a1a1a1" }}>Private AI for teams, on your own servers.</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Newsreader", data: serif, style: "normal", weight: 400 },
        { name: "Newsreader", data: serifItalic, style: "italic", weight: 400 },
      ],
    },
  );
}
