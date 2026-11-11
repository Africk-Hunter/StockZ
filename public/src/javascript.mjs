/* Entry point loaded by every page (<script type="module">). Each page module
   below wires itself up only if its page's elements exist (DOM feature
   detection), so importing them all everywhere is safe.

   error-reporting must stay first: it installs the console.error wrapper and
   global error handlers on import. */
import './lib/error-reporting.mjs';
import { auth } from './lib/firebase.mjs';

import { loggingOut } from './pages/nav.mjs';
import './pages/main-page.mjs';
import { startTickerInfoPage } from './pages/ticker-info.mjs';
import './pages/bulk-add.mjs';
import './pages/export-modal.mjs';
import './pages/remove-modal.mjs';
import { enterButton, continueSignedInUser } from './pages/login.mjs';
import { watchlistItemsContainer, startWatchlistPage } from './pages/watchlist-page.mjs';

auth.onAuthStateChanged(async (user) => {
    if (user) {
        startTickerInfoPage();
        if (watchlistItemsContainer) {
            startWatchlistPage(user);
        } else if (enterButton) {
            await continueSignedInUser(user);
        }
    } else if (!enterButton && !loggingOut) {
        // Signed out on any page but the login page: send them to login.
        window.location.replace('/');
    }
});
