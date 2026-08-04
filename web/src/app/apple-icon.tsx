import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 40,
          background: "linear-gradient(135deg, #0B3D91, #1E88E5)",
          border: "6px solid #D4AF37",
          color: "#fff",
          fontSize: 100,
          fontWeight: 800,
        }}
      >
        {/* See icon.tsx — Satori's default font can't render Arabic glyphs. */}
        N
      </div>
    ),
    { ...size }
  );
}
