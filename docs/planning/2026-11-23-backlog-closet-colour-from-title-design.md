# Closet: colour from a `| colour` title suffix (#422)

## Gap, verified on main 7b8edf3c
`closet_resolver._colour_from_title` read only a ` - ` suffix (Duer). A Shopify
product with a Size-only option list and a title like
`The Classic Short-Sleeve Shirt in Linen | Cocoa` (Everlane) got an unnamed
colour, so Check showed "No colour listed". The name `_colour_from_title`
already exists, so the function is extended rather than a new one added.

## Change
- `_colour_from_title` tries ` | ` first (last occurrence), then ` - `.
  Verbatim suffix, whitespace already normalised by `_text`; an empty suffix
  (title ends in `|`) is no colour.
- Order of precedence is unchanged: a Color/Colour option, then a `color_`
  tag, then the title. A title without a pipe behaves as before.
- `parse_shopify_json` feeds both paths (`link_import.draft`, and
  `closet_product` via `resolve`), so one change covers both. The family still
  comes from `closet_colors.colour_family` at apply time; a colour it does not
  know (e.g. Cocoa) is stored verbatim with no family and Check asks, as today.

## Name
Keep the full title as the garment name, as Duer's ` - Chestnut` already is.
Stripping would make resolver behaviour differ per separator, and the suffix
carries information the owner can trim in Check. No schema or UI change.

## Tests
Resolver table (pipe, odd whitespace, multiple pipes, empty suffix, no
spaces, no pipe, dash), option beats title, tag beats title; the From-links
draft and the attach-to-garment preview and PATCH with a synthetic fixture.
No migration, no network, no frontend.
