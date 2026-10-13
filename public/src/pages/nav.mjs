/* Navigation bar / bottom tab bar wiring and logout (every page but login has them). */
import { auth, signOut } from '../lib/firebase.mjs';

// Shared by every nav button: fade out, then navigate, unless we're
// already on that page.
function navigateTo(url, activePageMarker) {
    return function () {
        if (!document.URL.includes(activePageMarker)) {
            document.querySelector('main').classList.add("fadeAway");
            setTimeout(() => {
                window.location.href = url;
            }, 200);
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
}

document.querySelectorAll('.nav-logout').forEach((el) => el.addEventListener('click', function() {
    logOutUser();
}));
