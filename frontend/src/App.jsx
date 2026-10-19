import { lazy } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router'
import RootLayout from './layouts/RootLayout.jsx'
import About from './pages/About.jsx'
import Blog from './pages/Blog.jsx'
import Collection from './pages/Collection.jsx'
import Colophon from './pages/Colophon.jsx'
import BlogPost from './pages/BlogPost.jsx'
import Home from './pages/Home.jsx'
import Item from './pages/Item.jsx'
import MonthInReview from './pages/MonthInReview.jsx'
import Next from './pages/Next.jsx'
import Now from './pages/Now.jsx'
import NotFound from './pages/NotFound.jsx'
import Projects from './pages/Projects.jsx'
import YearInReview, { CurrentYear } from './pages/YearInReview.jsx'
import { itemPath } from './lib/spinePaths.js'

// The admin pages serve one person, so they load on demand instead of
// shipping to every visitor in the main chunk. RootLayout's Suspense
// boundary covers the wait.
const Admin = lazy(() => import('./pages/Admin.jsx'))
const AdminCatalogue = lazy(() => import('./pages/AdminCatalogue.jsx'))
const AdminDiscover = lazy(() => import('./pages/AdminDiscover.jsx'))
const AdminRadar = lazy(() => import('./pages/AdminRadar.jsx'))
const AdminStoreList = lazy(() => import('./pages/AdminStoreList.jsx'))
const AdminCollection = lazy(() => import('./pages/AdminCollection.jsx'))
const AdminImport = lazy(() => import('./pages/AdminImport.jsx'))
const AdminItem = lazy(() => import('./pages/AdminItem.jsx'))
const PlayNext = lazy(() => import('./pages/PlayNext.jsx'))

/**
 * The pre-rename item URL. `Navigate` does not interpolate route params, so
 * the id is read here and carried to /spine/:id.
 */
function CollectionItemRedirect() {
  const { id } = useParams()
  return <Navigate to={itemPath(id)} replace />
}

/**
 * The admin item page, remounted per id: going from one item to another
 * (back and forward included) must not carry the first item's form, or a
 * Save would PATCH it under the second item's URL.
 */
function KeyedAdminItem() {
  const { id } = useParams()
  return <AdminItem key={id} />
}

/**
 * Route table. Declarative mode — see the site shell spec, Key Decision 1.
 * All child routes render inside RootLayout's <Outlet />.
 */
export default function App() {
  return (
    <Routes>
      <Route element={<RootLayout />}>
        <Route index element={<Home />} />
        <Route path="about" element={<About />} />
        <Route path="projects" element={<Projects />} />
        <Route path="now" element={<Now />} />
        <Route path="colophon" element={<Colophon />} />
        <Route path="spine" element={<Collection />} />
        <Route path="spine/next" element={<Next />} />
        <Route path="spine/year" element={<CurrentYear />} />
        <Route path="spine/year/:year" element={<YearInReview />} />
        <Route path="spine/journal/:month" element={<MonthInReview />} />
        <Route path="spine/:id" element={<Item />} />
        {/* Pre-rename URLs, kept so links already shared still land. */}
        <Route path="collection" element={<Navigate to="/spine" replace />} />
        <Route path="collection/:id" element={<CollectionItemRedirect />} />
        <Route path="admin" element={<Admin />} />
        <Route path="admin/collection" element={<AdminCollection />} />
        <Route path="admin/import" element={<AdminImport />} />
        <Route path="admin/play-next" element={<PlayNext />} />
        <Route path="admin/catalogue" element={<AdminCatalogue />} />
        <Route path="admin/radar" element={<AdminRadar />} />
        <Route path="admin/discover" element={<AdminDiscover />} />
        <Route path="admin/store-list" element={<AdminStoreList />} />
        <Route path="admin/collection/:id" element={<KeyedAdminItem />} />
        <Route path="blog" element={<Blog />} />
        <Route path="blog/:slug" element={<BlogPost />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
