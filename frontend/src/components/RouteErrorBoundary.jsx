import { Component } from 'react'
import { Link } from 'react-router'

/**
 * Catches a render error in the routed page so the header, nav and footer
 * stay up and the visitor gets a way out, instead of a blank site.
 *
 * RootLayout keys it on the pathname, so navigating anywhere else clears
 * the error rather than carrying it to the next page.
 */
export default class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    // Kept for the browser console; there is no error service to report to.
    console.error('Page failed to render', error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <section className="route-error" role="alert">
        <h1>This page hit a problem</h1>
        <p>
          Something on this page failed to load. Reloading usually fixes it;
          otherwise, <Link to="/">go back home</Link>.
        </p>
      </section>
    )
  }
}
