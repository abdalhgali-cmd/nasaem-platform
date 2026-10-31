# Dialog

Dialogs confirm a consequential action or collect the one input it needs, without leaving the page.

- Title is the question ("رفض المستند؟"), the text says the consequence for the customer, the confirm button repeats the verb ("رفض المستند", never "نعم").
- Footer on `surface-sunken`: cancel (ghost) then confirm; confirm is `danger` for destructive actions, otherwise `primary`.
- `radius-xl`, `shadow-lg`, `overlay` scrim, `z-dialog`. Focus moves to the first field (or cancel for destructive confirms); Esc closes.
- Built on the Radix Dialog already in the codebase (`components/ui/sheet.tsx`).
