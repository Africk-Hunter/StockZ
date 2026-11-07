/* Login page (index.html): email/password sign-in, then cache the user's
   watchlist and go to /main. */
import { auth, signInWithEmailAndPassword } from '../lib/firebase.mjs';
import { syncWatchlistCache } from '../lib/watchlist-repo.mjs';

export const enterButton = document.getElementById("enterButton");
const inputUsername = document.getElementById('inputUsername');
const inputPassword = document.getElementById('inputPassword');

// Already signed in (e.g. a returning visit): skip the form.
export async function continueSignedInUser(user) {
    await syncWatchlistCache(user.uid);
    window.location.href = '/main';
}

async function loginUser(username, password) {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, username, password);
      return userCredential.user;
    } catch (error) {
      console.error("Error logging in: ", error);

      return null;
    }
}

// Error state: ember underline on the field plus a sentence saying what is wrong.
function showLoginError(message) {
    const el = document.getElementById('loginError');
    if (!el) return;
    el.textContent = message;
    el.classList.remove('hidden');
}

function clearLoginError(input) {
    input.classList.remove('is-error');
    const el = document.getElementById('loginError');
    if (el) el.classList.add('hidden');
}

async function handleLogin() {
    const username = inputUsername.value;
    const password = inputPassword.value;

    if (username === "") {
        inputUsername.classList.add('is-error');
    }
    if (password === "") {
        inputPassword.classList.add('is-error');
    }
    if (username === "" || password === "") {
        showLoginError('Enter your username and password.');
    }

    try {
        const user = await loginUser(username, password);
        if (user) {
            document.getElementById("stockZ").classList.add("fadeAway");
            var inputs = document.querySelectorAll('input[type="text"], input[type="password"]');
            inputs.forEach(function (input) {
                input.classList.add("fadeAway");
            });
            enterButton.classList.add("fadeAway");

            await syncWatchlistCache(user.uid);
            setTimeout(() => {
                window.location.href = '/main';
            }, 200);
        } else {
            inputUsername.classList.add('is-error');
            inputPassword.classList.add('is-error');
            showLoginError('Incorrect email or password. Try again.');
            alert('Incorrect email or password. Please try again.');
        }
    } catch (error) {
        console.error("Error during login or fetching watchlist: ", error);
        alert('Something went wrong signing you in. Please try again.');
    }
}

if (enterButton) {
    enterButton.addEventListener("click", handleLogin);
    inputUsername.addEventListener('click', () => clearLoginError(inputUsername));
    inputPassword.addEventListener('click', () => clearLoginError(inputPassword));

    inputUsername.addEventListener("keypress", function (event) {
        if (event.key === "Enter") {
            event.preventDefault();
            handleLogin();
        }
    });

    inputPassword.addEventListener("keypress", function (event) {
        if (event.key === "Enter") {
            event.preventDefault();
            handleLogin();
        }
    });
}
