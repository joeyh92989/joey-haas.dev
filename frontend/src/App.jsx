import { lazy } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router'
import RootLayout from './layouts/RootLayout.jsx'
import About from './pages/About.jsx'
import Blog from './pages/Blog.jsx'
import Collection from './pages/Collection.jsx'
import Colophon from './pages/Colophon.jsx'
import BlogPost from './pages/BlogPost.jsx'
import Home from './pages/Home.jsx'
import HowItWorks from './pages/HowItWorks.jsx'
import Item from './pages/Item.jsx'
import MonthInReview from './pages/MonthInReview.jsx'
import Next from './pages/Next.jsx'
import Now from './pages/Now.jsx'
import NotFound from './pages/NotFound.jsx'
import Projects from './pages/Projects.jsx'
import YearInReview, { CurrentYear } from './pages/YearInReview.jsx'
import { itemPath, monthPath, yearPath } from './lib/spinePaths.js'

// The admin pages serve one person, so they load on demand instead of
// shipping to every visitor in the main chunk. RootLayout's Suspense
// boundary covers the layout's wait, and AdminLayout's each page's.
const AdminLayout = lazy(() => import('./layouts/AdminLayout.jsx'))
const Admin = lazy(() => import('./pages/Admin.jsx'))
const AdminAnalytics = lazy(() => import('./pages/AdminAnalytics.jsx'))
const AdminCatalogue = lazy(() => import('./pages/AdminCatalogue.jsx'))
const AdminDiscover = lazy(() => import('./pages/AdminDiscover.jsx'))
const AdminRadar = lazy(() => import('./pages/AdminRadar.jsx'))
const AdminStoreList = lazy(() => import('./pages/AdminStoreList.jsx'))
const AdminCollection = lazy(() => import('./pages/AdminCollection.jsx'))
const AdminImport = lazy(() => import('./pages/AdminImport.jsx'))
const AdminItem = lazy(() => import('./pages/AdminItem.jsx'))
const PlayNext = lazy(() => import('./pages/PlayNext.jsx'))

/**
 * A pre-rename URL with a param. `Navigate` does not interpolate route
 * params, so the params are read here and handed to `to`, which builds the
 * /shelf path.
 */
function ParamRedirect({ to }) {
  return <Navigate to={to(useParams())} replace />
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
        <Route path="shelf" element={<Collection />} />
        <Route path="shelf/next" element={<Next />} />
        <Route path="shelf/how" element={<HowItWorks />} />
        <Route path="shelf/year" element={<CurrentYear />} />
        <Route path="shelf/year/:year" element={<YearInReview />} />
        <Route path="shelf/journal/:month" element={<MonthInReview />} />
        <Route path="shelf/:id" element={<Item />} />
        {/* Pre-rename URLs, kept so links already shared still land. Each
            goes straight to /shelf, never through another redirect. */}
        <Route path="spine" element={<Navigate to="/shelf" replace />} />
        <Route
          path="spine/next"
          element={<Navigate to="/shelf/next" replace />}
        />
        <Route
          path="spine/how"
          element={<Navigate to="/shelf/how" replace />}
        />
        <Route path="spine/year" element={<CurrentYear />} />
        <Route
          path="spine/year/:year"
          element={<ParamRedirect to={({ year }) => yearPath(year)} />}
        />
        <Route
          path="spine/journal/:month"
          element={<ParamRedirect to={({ month }) => monthPath(month)} />}
        />
        <Route
          path="spine/:id"
          element={<ParamRedirect to={({ id }) => itemPath(id)} />}
        />
        <Route path="collection" element={<Navigate to="/shelf" replace />} />
        <Route
          path="collection/:id"
          element={<ParamRedirect to={({ id }) => itemPath(id)} />}
        />
        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<Admin />} />
          <Route path="analytics" element={<AdminAnalytics />} />
          <Route path="collection" element={<AdminCollection />} />
          <Route path="import" element={<AdminImport />} />
          <Route path="play-next" element={<PlayNext />} />
          <Route path="catalogue" element={<AdminCatalogue />} />
          <Route path="radar" element={<AdminRadar />} />
          <Route path="discover" element={<AdminDiscover />} />
          <Route path="store-list" element={<AdminStoreList />} />
          <Route path="collection/:id" element={<KeyedAdminItem />} />
          {/* Inside the shell, so a mistyped admin URL keeps the sidebar. */}
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="blog" element={<Blog />} />
        <Route path="blog/:slug" element={<BlogPost />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
