// assets/router.js
/**
 * Hash-based SPA router.
 * Routes: #/overview, #/composition, #/tariffs, #/macro, #/forecast, #/methods
 */

import { setState, getState, restoreFiltersFromURL } from './state.js';

const ROUTES = ['#/overview', '#/composition', '#/tariffs', '#/macro', '#/forecast', '#/methods'];
const DEFAULT_ROUTE = '#/overview';

let _renderFn = null;

/**
 * Initialise the router.
 * @param {function} renderFn - called with (routeName) on every route change
 */
export function initRouter(renderFn) {
  _renderFn = renderFn;
  window.addEventListener('hashchange', handleHashChange);
  handleHashChange(); // initial
}

function handleHashChange() {
  const hash = window.location.hash || DEFAULT_ROUTE;
  const route = hash.split('?')[0];
  const matched = ROUTES.includes(route) ? route : DEFAULT_ROUTE;

  if (matched !== route) {
    window.location.hash = matched;
    return;
  }

  setState('ui.activeRoute', matched);
  restoreFiltersFromURL();
  if (_renderFn) _renderFn(matched);
  updateNavHighlight(matched);
}

function updateNavHighlight(route) {
  document.querySelectorAll('.nav-link').forEach(el => {
    el.classList.toggle('active', el.getAttribute('href') === route);
  });
}

export function navigate(route) {
  window.location.hash = route;
}

export { ROUTES };
