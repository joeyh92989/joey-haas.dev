import { useId, useState } from 'react'
import { productCopy as copy } from '../content/closetProduct.js'
import { apiFetch, errorMessage } from '../lib/api.js'
import { btn, field, FILE_PICK } from './closetClasses.js'
import {
  GARMENT_ATTACH,
  GARMENT_ATTACH_CHOICE,
  GARMENT_ATTACH_LINK,
  GARMENT_ATTACH_READ,
  GARMENT_ATTACH_ROW,
  GARMENT_ATTACH_TITLE,
  GARMENT_FIELD_LABEL,
} from './intakeFormClasses.js'

/** Dollars as the store gave them, or nothing. */
function priceText(price) {
  return price ? `$${price}` : ''
}

/**
 * The garment page's photo and product tools. Adding or replacing a photo
 * changes the photo and nothing else. Attaching a product is two calls: a
 * read-only look at the link, then, once the owner has chosen a color and a
 * size, the write. The server re-reads the link and checks the choice, so
 * this panel only sends ids.
 *
 * @param {object} props
 * @param {object} props.garment A `GarmentOut`.
 * @param {(garment: object) => void} props.onPhoto The garment, new photo.
 * @param {(garment: object) => void} props.onAttached The garment after an
 *   attach; its fields changed, so the form starts again from them.
 */
export default function GarmentProductPanel({ garment, onPhoto, onAttached }) {
  const id = useId()
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [link, setLink] = useState('')
  const [read, setRead] = useState(null)
  const [pick, setPick] = useState(null)
  const [size, setSize] = useState('')
  const [replaceBrand, setReplaceBrand] = useState(false)
  const [replaceColor, setReplaceColor] = useState(false)
  const [replaceSize, setReplaceSize] = useState(false)
  const [replaceProduct, setReplaceProduct] = useState(false)

  async function sendPhoto(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy('photo')
    setError(null)
    setNotice(null)
    try {
      const body = new FormData()
      body.append('photo', file)
      const response = await apiFetch(
        `/api/closet/garments/${garment.id}/photo`,
        {
          method: 'POST',
          body,
        },
      )
      if (!response.ok) {
        setError(await errorMessage(response))
        return
      }
      onPhoto(await response.json())
      setNotice(copy.photoDone)
    } catch {
      setError(copy.photoFailed)
    } finally {
      setBusy(null)
    }
  }

  async function lookUp(event) {
    event.preventDefault()
    setBusy('look')
    setError(null)
    setNotice(null)
    setRead(null)
    try {
      const response = await apiFetch(
        `/api/closet/garments/${garment.id}/product`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: link.trim() }),
        },
      )
      if (!response.ok) {
        setError(await errorMessage(response))
        return
      }
      const body = await response.json()
      if (body.state === 'refused') {
        setError(`${body.message}. ${copy.refusedTail}`)
        return
      }
      setRead(body)
      setPick(body.candidates.length === 1 ? body.candidates[0] : null)
      setSize('')
      setReplaceBrand(false)
      setReplaceColor(false)
      setReplaceSize(false)
      setReplaceProduct(false)
    } catch {
      setError(copy.lookFailed)
    } finally {
      setBusy(null)
    }
  }

  async function attach() {
    setBusy('attach')
    setError(null)
    try {
      const response = await apiFetch(
        `/api/closet/garments/${garment.id}/product`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: read.url,
            external_id: pick.external_id,
            size: size || null,
            replace_brand: replaceBrand,
            replace_color: replaceColor,
            replace_size: replaceSize,
            replace_product: replaceProduct,
          }),
        },
      )
      if (!response.ok) {
        setError(await errorMessage(response, { ownConflicts: true }))
        return
      }
      const body = await response.json()
      const outcome = copy.photoOutcome[body.photo]
      setNotice(
        `${copy.attached} ${
          typeof outcome === 'function' ? outcome(body.photo_error) : outcome
        }${body.kept.length ? copy.kept(body.kept) : ''}`,
      )
      setRead(null)
      setLink('')
      onAttached(body.garment)
    } catch {
      setError(copy.attachFailed)
    } finally {
      setBusy(null)
    }
  }

  const sizes = pick?.sizes.filter((s) => s.size) ?? []
  const brandClash =
    read?.brand && garment.brand && read.brand !== garment.brand
  // The owner's own color and size are only replaced when they say so.
  const colorClash =
    garment.color_name &&
    pick?.color_name &&
    garment.color_source === 'manual' &&
    garment.color_name !== pick.color_name
  const theSize =
    size || (sizes.length === 1 && !garment.size ? sizes[0].size : '')
  const sizeClash = garment.size && theSize && garment.size !== theSize
  const needsReplace = Boolean(read?.attached)
  const ready = Boolean(pick) && (!needsReplace || replaceProduct)

  return (
    <section
      className={`garment-attach ${GARMENT_ATTACH}`}
      aria-labelledby={`${id}-h`}
    >
      <h2
        id={`${id}-h`}
        className={`garment-attach-title ${GARMENT_ATTACH_TITLE}`}
      >
        {copy.heading}
      </h2>

      <div className={`garment-attach-row ${GARMENT_ATTACH_ROW}`}>
        <label className={`${btn('plain', 'sm')} ${FILE_PICK}`}>
          {garment.image ? copy.replacePhoto : copy.addPhoto}
          <input
            type="file"
            accept="image/*"
            className="visually-hidden"
            aria-label={copy.photoInput}
            disabled={busy !== null}
            onChange={sendPhoto}
          />
        </label>
        {busy === 'photo' && (
          <span className="muted" role="status">
            {copy.photoBusy}
          </span>
        )}
      </div>

      <form
        className={`garment-attach-row ${GARMENT_ATTACH_ROW}`}
        onSubmit={lookUp}
      >
        <label className={`garment-attach-link ${GARMENT_ATTACH_LINK}`}>
          <span className={`garment-field-label ${GARMENT_FIELD_LABEL}`}>
            {copy.linkLabel}
          </span>
          <input
            className={field}
            type="url"
            value={link}
            placeholder={copy.linkHint}
            maxLength={2000}
            onChange={(e) => setLink(e.target.value)}
          />
        </label>
        <button
          type="submit"
          className={btn('plain', 'sm')}
          disabled={busy !== null || !link.trim()}
        >
          {busy === 'look' ? copy.lookingUp : copy.lookUp}
        </button>
      </form>

      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="muted" role="status">
          {notice}
        </p>
      )}

      {read && (
        <div className={`garment-attach-read ${GARMENT_ATTACH_READ}`}>
          <p>
            <strong>{read.title}</strong>
            {read.brand ? ` · ${read.brand}` : ''}
          </p>
          <fieldset className="garment-attach-colors">
            <legend className={`garment-field-label ${GARMENT_FIELD_LABEL}`}>
              {copy.colorLegend}
            </legend>
            {read.candidates.map((c) => (
              <label
                key={c.external_id}
                className={`garment-attach-choice ${GARMENT_ATTACH_CHOICE}`}
              >
                <input
                  type="radio"
                  name={`${id}-color`}
                  checked={pick?.external_id === c.external_id}
                  onChange={() => {
                    setPick(c)
                    setSize('')
                  }}
                />
                {c.color_name || copy.noColor}
                {c.price ? ` · ${priceText(c.price)}` : ''}
              </label>
            ))}
          </fieldset>
          {sizes.length > 0 && (
            <label>
              <span className={`garment-field-label ${GARMENT_FIELD_LABEL}`}>
                {copy.sizeLabel}
              </span>
              <select
                className={field}
                value={size}
                onChange={(e) => setSize(e.target.value)}
              >
                <option value="">{copy.sizeNone}</option>
                {sizes.map((s) => (
                  <option key={s.variant_id ?? s.size} value={s.size}>
                    {s.size}
                  </option>
                ))}
              </select>
            </label>
          )}
          {brandClash && (
            <label className={`garment-attach-choice ${GARMENT_ATTACH_CHOICE}`}>
              <input
                type="checkbox"
                checked={replaceBrand}
                onChange={(e) => setReplaceBrand(e.target.checked)}
              />
              {copy.replaceBrand(garment.brand, read.brand)}
            </label>
          )}
          {colorClash && (
            <label className={`garment-attach-choice ${GARMENT_ATTACH_CHOICE}`}>
              <input
                type="checkbox"
                checked={replaceColor}
                onChange={(e) => setReplaceColor(e.target.checked)}
              />
              {copy.replaceColor(garment.color_name, pick.color_name)}
            </label>
          )}
          {sizeClash && (
            <label className={`garment-attach-choice ${GARMENT_ATTACH_CHOICE}`}>
              <input
                type="checkbox"
                checked={replaceSize}
                onChange={(e) => setReplaceSize(e.target.checked)}
              />
              {copy.replaceSize(garment.size, theSize)}
            </label>
          )}
          {needsReplace && (
            <label className={`garment-attach-choice ${GARMENT_ATTACH_CHOICE}`}>
              <input
                type="checkbox"
                checked={replaceProduct}
                onChange={(e) => setReplaceProduct(e.target.checked)}
              />
              {copy.replaceProduct(read.attached.title)}
            </label>
          )}
          <p className="muted">
            {read.has_photo ? copy.keepsPhoto : copy.addsPhoto}{' '}
            {copy.unsavedNote}
          </p>
          <button
            type="button"
            className={btn('primary', 'sm')}
            disabled={busy !== null || !ready}
            onClick={attach}
          >
            {busy === 'attach' ? copy.attaching : copy.attach}
          </button>
        </div>
      )}
    </section>
  )
}
