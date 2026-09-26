import { Route, Routes } from 'react-router'
import RootLayout from './layouts/RootLayout.jsx'
import About from './pages/About.jsx'
import Admin from './pages/Admin.jsx'
import AdminCatalogue from './pages/AdminCatalogue.jsx'
import AdminCollection from './pages/AdminCollection.jsx'
import AdminImport from './pages/AdminImport.jsx'
import AdminItem from './pages/AdminItem.jsx'
import Blog from './pages/Blog.jsx'
import Collection from './pages/Collection.jsx'
import BlogPost from './pages/BlogPost.jsx'
import Home from './pages/Home.jsx'
import Item from './pages/Item.jsx'
import NotFound from './pages/NotFound.jsx'
import PlayNext from './pages/PlayNext.jsx'
import Projects from './pages/Projects.jsx'

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
        <Route path="collection" element={<Collection />} />
        <Route path="collection/:id" element={<Item />} />
        <Route path="admin" element={<Admin />} />
        <Route path="admin/collection" element={<AdminCollection />} />
        <Route path="admin/import" element={<AdminImport />} />
        <Route path="admin/play-next" element={<PlayNext />} />
        <Route path="admin/catalogue" element={<AdminCatalogue />} />
        <Route path="admin/collection/:id" element={<AdminItem />} />
        <Route path="blog" element={<Blog />} />
        <Route path="blog/:slug" element={<BlogPost />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
