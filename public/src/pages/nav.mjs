/* Navigation bar / bottom tab bar wiring and logout (every page but login has them). */
import { auth, signOut } from '../lib/firebase.mjs';

// Keep in sync with .fade-out-fast in input.css. Short on purpose: the felt
// delay on tab switches is mostly this wait plus the next page's load.
const NAV_FADE_MS = 90;

// Warm the HTTP cache for the other tabs so the real navigation is near-instant.
function prefetchPages(urls) {
    const run = () => document.head && urls.forEach((url) => {
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = url;
        document.head.appendChild(link);
    });
    if ('requestIdleCallback' in window) requestIdleCallback(run); else setTimeout(run, 500);
}

// Shared by every nav button: fade out, then navigate, unless we're
// already on that page.
function navigateTo(url, activePageMarker) {
    return function () {
        if (!document.URL.includes(activePageMarker)) {
            document.querySelector('main').classList.add("fadeAwayFast");
            setTimeout(() => {
                window.location.href = url;
            }, NAV_FADE_MS);
        }
    };
}

async function logOutUser(){
    try {
        await signOut(auth);
        document.getElementById('mainWrapper').classList.add('fadeAway');
        setTimeout(() => {
          window.location.href = '/';
        }, 500);
      } catch (error) {
        console.error('Error logging out: ', error);
        alert('An error occurred while logging out. Please try again.');
      }
}

// The login page has no nav; every other page does.
if (!document.getElementById("enterButton")) {
    // Each nav destination has two DOM elements per page (the desktop top
    // nav item and the mobile bottom tab bar item), so wiring is done by
    // shared class instead of a single id.
    document.querySelectorAll('.nav-home').forEach((el) => el.addEventListener('click', navigateTo('/main', 'main.html')));
    document.querySelectorAll('.nav-ticker-info').forEach((el) => el.addEventListener('click', navigateTo('/tickerInfo', 'tickerInfo.html')));
    document.querySelectorAll('.nav-watchlist').forEach((el) => el.addEventListener('click', navigateTo('/watchlist', 'watchlist.html')));
    prefetchPages(['/main', '/tickerInfo', '/watchlist'].filter((u) => !document.URL.includes(u.slice(1))));
}

document.querySelectorAll('.nav-logout').forEach((el) => el.addEventListener('click', function() {
    logOutUser();
}));
