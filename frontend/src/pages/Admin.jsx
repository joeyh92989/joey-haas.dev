import AdminPageHeader from '../components/AdminPageHeader.jsx'
import LastNightly from '../components/LastNightly.jsx'

/** The admin landing, at /admin. AdminLayout has already checked the session. */
export default function Admin() {
  return (
    <section>
      <AdminPageHeader title="Dashboard" />
      <LastNightly />
    </section>
  )
}
