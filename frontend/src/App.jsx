import { Route, Routes } from 'react-router'
import RootLayout from './layouts/RootLayout.jsx'
import About from './pages/About.jsx'
import Admin from './pages/Admin.jsx'
import AdminCollection from './pages/AdminCollection.jsx'
import AdminImport from './pages/AdminImport.jsx'
import Blog from './pages/Blog.jsx'
import BlogPost from './pages/BlogPost.jsx'
import Home from './pages/Home.jsx'
import NotFound from './pages/NotFound.jsx'
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
        <Route path="admin" element={<Admin />} />
        <Route path="admin/collection" element={<AdminCollection />} />
        <Route path="admin/import" element={<AdminImport />} />
        <Route path="blog" element={<Blog />} />
        <Route path="blog/:slug" element={<BlogPost />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
