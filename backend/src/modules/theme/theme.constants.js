// Reuses the generic Setting key-value table (same pattern as the
// homepage hero fields) — theme is a handful of singleton values, not a
// list, so no dedicated model/migration is needed.
export const THEME_SETTING_KEYS = {
  primary: "THEME_COLOR_PRIMARY",
  secondary: "THEME_COLOR_SECONDARY",
  accent: "THEME_COLOR_ACCENT",
  background: "THEME_COLOR_BACKGROUND",
  text: "THEME_COLOR_TEXT",
  button: "THEME_COLOR_BUTTON",
};

// #RRGGBB only — admins configure a color swatch, never raw CSS/JS, so
// there is no way to inject arbitrary style or script through this field.
export const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
