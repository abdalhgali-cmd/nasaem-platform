import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 8,
          background: "linear-gradient(135deg, #0B3D91, #1E88E5)",
          border: "1.5px solid #D4AF37",
          color: "#fff",
          fontSize: 20,
          fontWeight: 800,
        }}
      >
        {/* Satori's default font has no Arabic glyphs (silently falls back
            to a placeholder shape, doesn't error) — using the Latin
            initial here, a common convention for favicons even on
            Arabic-first sites. */}
        N
      </div>
    ),
    { ...size }
  );
}
