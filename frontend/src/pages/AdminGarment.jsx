import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { adminCopy } from '../content/adminCopy.js'
import AdminPageHeader from '../components/AdminPageHeader.jsx'
import GarmentForm from '../components/GarmentForm.jsx'
import GarmentProductPanel from '../components/GarmentProductPanel.jsx'
import { LOAD_ERROR, SESSION_ENDED, WAKING } from '../content/status.js'
import { apiFetch, errorMessage } from '../lib/api.js'
import { garmentTitle, statLine } from '../lib/closet.js'
import { btn } from '../components/closetClasses.js'

/**
 * One garment, at /admin/closet/:id: the photo and every field the tagger
 * fills, by hand. Remounted per id by App.jsx, so a form never carries one
 * garment's fields to another's URL.
 */
export default function AdminGarment() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [garment, setGarment] = useState(null)
  const [error, setError] = useState(null)
  const [slow, setSlow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  // Bumped on save, so the form starts again from what the API kept.
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let live = true
    const timer = setTimeout(() => setSlow(true), 3000)
    apiFetch(`/api/closet/garments/${id}`)
      .then(async (response) => {
        if (!live) return
        if (response.ok) setGarment(await response.json())
        else if (response.status === 404) setError('No garment has this id.')
        else if (response.status === 401 || response.status === 403)
          setError(SESSION_ENDED)
        else setError(LOAD_ERROR)
      })
      .catch(() => live && setError(LOAD_ERROR))
      .finally(() => clearTimeout(timer))
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [id])

  async function save(body) {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const response = await apiFetch(`/api/closet/garments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        setError(await errorMessage(response))
        return
      }
      setGarment(await response.json())
      setVersion((v) => v + 1)
      setSaved(true)
    } catch {
      setError('The save did not reach the server. Check your connection.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      const response = await apiFetch(`/api/closet/garments/${id}`, {
        method: 'DELETE',
      })
      if (!response.ok && response.status !== 404) {
        setError(await errorMessage(response))
        return
      }
      navigate('/admin/closet')
    } catch {
      setError('The delete did not reach the server. Check your connection.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="garment-page">
      <AdminPageHeader
        title={adminCopy.closetGarment.title}
        description={garment ? garmentTitle(garment) : null}
      >
        <Link className={btn('ghost', 'sm')} to="/admin/closet">
          {adminCopy.closetGarment.backToCloset}
        </Link>
      </AdminPageHeader>
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="muted" role="status">
          Saved · {statLine(garment)}
        </p>
      )}
      {garment && (
        <GarmentProductPanel
          garment={garment}
          onPhoto={setGarment}
          onAttached={(next) => {
            setGarment(next)
            setSaved(false)
            // The attach moved brand, colour and size: the form starts again
            // from what the API now holds, or a save would put them back.
            setVersion((v) => v + 1)
          }}
        />
      )}
      {garment ? (
        <GarmentForm
          key={version}
          garment={garment}
          busy={busy}
          onSave={save}
          onDelete={remove}
        />
      ) : (
        !error && (
          <p className="muted" role="status">
            {slow ? WAKING : 'Loading…'}
          </p>
        )
      )}
    </section>
  )
}
