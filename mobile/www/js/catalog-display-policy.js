// Home may display general offline content, but must not display an old
// catalogue amount as a current price or enabled booking shortcut.
export function catalogDisplayMode(catalog) {
  if (!catalog || catalog.stale === true) return "REFRESH_REQUIRED";
  return "CURRENT";
}
