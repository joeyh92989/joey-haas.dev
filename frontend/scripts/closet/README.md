# Closet seed export (Stitch Fix)

`stitchfix-export.console.js` is a script you paste into the browser console on
Stitch Fix. It downloads a CSV of the pieces you kept, in the closet file way
in's seed format. `stitchfix-export.mjs` holds the same mapping logic as a
module so it can be tested; `stitchfix-export.test.mjs` tests it and checks the
two files stay identical.

Columns: `n,source,order_id,date,date_basis,brand,name,color_name,size,price_usd,category_hint,store_item_no,still_owned,image_url`
(`source=stitchfix`, `date_basis=checkout`, `still_owned=yes`).

## Run it

1. Sign in at https://www.stitchfix.com and open https://www.stitchfix.com/orders.
2. Open the browser console (Chrome: Cmd+Option+J). If it warns about pasting, type `allow pasting` first.
3. Paste the whole of `stitchfix-export.console.js` and press Enter.
4. It walks the order list (a hidden frame per page, up to 20 pages), then reads
   each order page, one request at a time with a short pause. Progress prints in the console.
5. `stitchfix-seed.csv` lands in Downloads. Move it to `~/Developer/closet-seed/`.
   **Not into the repo.** It is purchase history; the repo is public.

For the monthly run, set `const SINCE = '2026-11-01'` at the top of the script
before pasting: only orders checked out after that day are written.

## What it leaves out

- Pieces you returned (a box's `returns` list). Pieces never appear with `still_owned=no`.
- Boxes with no checkout date yet: you have not decided on them.
- Everything that is not a line item. Order data also carries a shipping address
  and card digits; the script reads only the named item fields (brand, name,
  colour, size, department, image, price, sku id) plus the order id and date.
  It never copies, logs or saves the rest, and it sends nothing anywhere: it
  only GETs stitchfix.com pages on the same origin.
- Department maps to `category_hint`: tops `top`, bottoms `bottom`, footwear
  `shoes`, any other department `accessory`.

## If the layout changes

Verified by hand on 2026-11-16, and it may drift. The script depends on:

- order links `a[href^="/orders/<digits>"]` appearing on `/orders?page=N` after load (drawn client-side);
- `div[data-react-class="OrderHistory"]` on each `/orders/<id>` page, its
  `data-react-props` JSON holding `clientOrder.order.deliveries[].skus[]`,
  `clientOrder.order.returns[].skus[].id` and `clientOrder.date_checked_out`.

If it prints "No pieces found" or skips orders, inspect those two places in the
browser, then update `rowsFromOrder` in the module (a test fixture first) and
copy the block between the `SHARED` markers into the console file; the test fails until they match.

Tests: `cd frontend && npm test`.
