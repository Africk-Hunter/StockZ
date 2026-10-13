/* Entry point loaded by every page (<script type="module">). Each page module
   below wires itself up only if its page's elements exist (DOM feature
   detection), so importing them all everywhere is safe.

   error-reporting must stay first: it installs the console.error wrapper and
   global error handlers on import. */
import './lib/error-reporting.mjs';
import { auth } from './lib/firebase.mjs';

import './pages/nav.mjs';
import './pages/main-page.mjs';
import './pages/ticker-info.mjs';
import './pages/bulk-add.mjs';
import { enterButton, continueSignedInUser } from './pages/login.mjs';
import { watchlistItemsContainer, startWatchlistPage } from './pages/watchlist-page.mjs';

auth.onAuthStateChanged(async (user) => {
    if (user) {
        if (watchlistItemsContainer) {
            startWatchlistPage(user);
        } else if (enterButton) {
            await continueSignedInUser(user);
        }
    }
});
