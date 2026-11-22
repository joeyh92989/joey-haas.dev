// The garment form and product panel, the metadata picker, the ISBN field and the barcode scanner
// (#536, slice D5b). The class names stay on the elements as hooks (tests, e2e
// and print read them); the look is these utilities. The base layer zeroes
// margin and padding on every element, so a rule that said `margin: 0` is not
// repeated.

export const METADATA_PICKER =
  "mt-4 [&_label]:text-(--text-3) [&_label]:block [&_label]:text-[0.8125rem] [&_label]:mb-1 [&_input[type='search']]:bg-(--surface) [&_input[type='search']]:border [&_input[type='search']]:border-(--line) [&_input[type='search']]:rounded-[8px] [&_input[type='search']]:text-(--text) [&_input[type='search']]:text-[0.875rem] [&_input[type='search']]:max-w-[24rem] [&_input[type='search']]:p-2 [&_input[type='search']]:w-full [&_input[type='search']:focus-visible]:border-(--accent) [&_input[type='search']:focus-visible]:outline-2 [&_input[type='search']:focus-visible]:outline-solid [&_input[type='search']:focus-visible]:outline-(--accent) [&_input[type='search']:focus-visible]:outline-offset-2 max-[700px]:[.item-relink_&_input]:min-h-11 max-[700px]:[_.needs-match-row_&_input]:min-h-11"

export const CANDIDATE_LIST =
  'border border-(--line) rounded-[8px] list-none mt-2 max-h-[20rem] max-w-[24rem] overflow-y-auto [&_li+li]:border-t [&_li+li]:border-t-(--line) [&_button]:items-center [&_button]:bg-transparent [&_button]:bg-none [&_button]:[border:0] [&_button]:text-(--text) [&_button]:cursor-pointer [&_button]:flex [&_button]:text-[0.875rem] [&_button]:gap-2 [&_button]:p-2 [&_button]:text-left [&_button]:w-full [&_button:hover]:bg-(--sunken) [&_button:focus-visible]:bg-(--sunken) [&_img]:rounded-[4px] [&_img]:flex-none [&_img]:h-13.5 [&_img]:object-cover [&_img]:w-9'

export const CANDIDATE_THUMB_EMPTY =
  'rounded-[4px] flex-none h-13.5 object-cover w-9 bg-(--sunken) border border-(--line) block'

export const COMIC_EDITION_ISBN =
  'items-center grid gap-2 grid-cols-[auto_minmax(0,1fr)_auto_auto] mt-2 [&_label]:text-(--text-3) [&_label]:text-[0.8125rem]'

export const COMIC_EDITION_ISBN_NOTE =
  'grid gap-1 col-[1/-1] [&_p]:text-[0.875rem]'

export const COMIC_EDITION_ISBN_COVER =
  '[block-size:3rem] inline-block [inline-size:auto] me-2 align-middle'

export const ISBN_SCANNER = 'grid gap-3 p-4'

export const ISBN_SCANNER_VIDEO =
  'aspect-[4/3] bg-(--surface) border border-(--line) rounded-[8px] [inline-size:100%] object-cover'

export const ISBN_SCANNER_STATUS = '[min-block-size:1.5em]'

export const GARMENT_FORM = 'grid gap-4 max-w-[36rem]'

export const GARMENT_FIELD_LABEL =
  'text-[0.8125rem] text-(--text-2) [.garment-stepper_&]:min-w-[5.5rem]'

export const GARMENT_FORM_PHOTO =
  'w-40 aspect-[4/5] object-cover border border-(--line) rounded-(--radius)'

export const GARMENT_COLOR =
  "flex flex-wrap gap-2 items-end [&_input[type='color']]:w-10 [&_input[type='color']]:h-9 [&_input[type='color']]:p-[0.15rem] [&_input[type='color']]:bg-(--surface) [&_input[type='color']]:border [&_input[type='color']]:border-(--line-strong) [&_input[type='color']]:rounded-(--radius) [&_input[type='color'][data-unset='true']]:border-dashed"

export const GARMENT_STEPPER =
  'flex gap-2 items-center [&_output]:min-w-[1.5rem] [&_output]:text-center'

export const GARMENT_FORM_ACTS = 'flex flex-wrap gap-2'

export const CLOSET_WEEK_DAY =
  'grid grid-cols-[3rem_minmax(0,1fr)_auto] gap-2 items-center [&_label]:inline-flex [&_label]:gap-1 [&_label]:items-center'

export const GARMENT_ATTACH =
  'grid gap-3 max-w-[36rem] mb-4 p-3 border border-(--line) rounded-(--radius)'

export const GARMENT_ATTACH_TITLE = 'text-[1rem]'

export const GARMENT_ATTACH_ROW = 'flex flex-wrap gap-2 items-end'

export const GARMENT_ATTACH_LINK = 'grid gap-1 flex-[1_1_14rem]'

export const GARMENT_ATTACH_READ =
  'grid gap-3 [&_label]:grid [&_label]:gap-1 [&_fieldset]:grid [&_fieldset]:gap-1 [&_fieldset]:[border:0]'

export const GARMENT_ATTACH_CHOICE =
  '[.garment-attach-read_&]:flex [.garment-attach-read_&]:gap-2 [.garment-attach-read_&]:items-center'

/** A fieldset the garment form draws as a row of choices (segments, months):
 *  it beats the form's boxed fieldset, and its legend takes the whole row. */
export const GARMENT_CHOICES =
  'flex flex-wrap gap-2 [border:0] p-0 [&_legend]:mb-1 [&_legend]:w-full [&_legend]:p-0'

/** The form's labels and boxed fieldsets are grids. They are set on each one,
 *  not on the form's descendants: the chip labels are flex, and a descendant
 *  rule would beat them. */
export const GARMENT_LABEL = 'grid gap-1'
export const GARMENT_FIELDSET =
  'grid gap-1 border border-(--line) rounded-(--radius) p-3 [&_legend]:px-1'
