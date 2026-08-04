import { ImageResponse } from "next/og";
import { siteConfig } from "@/lib/site-config";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0B3D91 0%, #0a2f70 60%, #071f4d 100%)",
          color: "#fff",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            width: 120,
            height: 120,
            borderRadius: 28,
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(135deg, #0B3D91, #1E88E5)",
            border: "3px solid #D4AF37",
            fontSize: 64,
            fontWeight: 800,
            marginBottom: 32,
          }}
        >
          N
        </div>
        {/* Satori (the ImageResponse renderer) has no Arabic glyphs in its
            default font — isolated letters silently render as a placeholder
            shape, and full connected Arabic text throws a font-substitution
            error outright. Using the Latin name/initial here is reliable. */}
        <div style={{ display: "flex", fontSize: 56, fontWeight: 800 }}>
          {siteConfig.nameEn}
        </div>
        <div style={{ display: "flex", fontSize: 28, color: "#D4AF37", marginTop: 16 }}>
          Umrah · Visas · Flights · Hotels
        </div>
      </div>
    ),
    { ...size }
  );
}
