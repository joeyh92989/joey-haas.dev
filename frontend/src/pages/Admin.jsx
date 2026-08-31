import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { apiFetch, loginUrl } from '../lib/api.js'

/**
 * Admin area. Deliberately absent from the site navigation — reachable only by
 * typing the URL. That is not a security control; the server-side session check
 * is. It keeps a personal site from looking like an app with a login wall.
 */
export default function Admin() {
  const [status, setStatus] = useState('checking')
  const [email, setEmail] = useState(null)
  const [slow, setSlow] = useState(false)
  const [searchParams] = useSearchParams()
  const denied = searchParams.get('error') === 'access_denied'

  useEffect(() => {
    // The API sleeps on Render's free tier, so a first request after idle can
    // take ~30 seconds. Without this the page looks broken rather than slow.
    const timer = setTimeout(() => setSlow(true), 3000)

    apiFetch('/api/auth/me')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        setEmail(data ? data.email : null)
        setStatus(data ? 'signed-in' : 'signed-out')
      })
      .catch(() => setStatus('error'))
      .finally(() => clearTimeout(timer))

    return () => clearTimeout(timer)
  }, [])

  async function signOut() {
    await apiFetch('/api/auth/logout', { method: 'POST' })
    setEmail(null)
    setStatus('signed-out')
  }

  return (
    <section>
      <h2>Admin</h2>

      {denied && (
        <p className="admin-error">
          That account is not authorized for this site.
        </p>
      )}

      {status === 'checking' && (
        <p className="muted">
          {slow ? 'Waking the server…' : 'Checking your session…'}
        </p>
      )}

      {status === 'error' && (
        <p className="admin-error">Could not reach the API. Try again shortly.</p>
      )}

      {status === 'signed-out' && (
        <p>
          <a className="admin-signin" href={loginUrl}>
            Sign in with Google
          </a>
        </p>
      )}

      {status === 'signed-in' && (
        <>
          <p>
            Signed in as <strong>{email}</strong>.
          </p>
          <p>
            <button type="button" className="admin-signout" onClick={signOut}>
              Sign out
            </button>
          </p>
        </>
      )}
    </section>
  )
}
