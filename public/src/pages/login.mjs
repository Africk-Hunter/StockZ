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

async function handleLogin() {
    const username = inputUsername.value;
    const password = inputPassword.value;

    if (username === "") {
        inputUsername.style.background = "red";
    }
    if (password === "") {
        inputPassword.style.background = "red";
    }
    inputPassword.addEventListener('click', function () {
        inputPassword.style.background = '#E4ECE4';
    });
    inputUsername.addEventListener('click', function () {
        inputUsername.style.background = '#E4ECE4';
    });

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
            inputUsername.style.background = 'red';
            inputPassword.style.background = 'red';
            alert('Incorrect email or password. Please try again.');
        }
    } catch (error) {
        console.error("Error during login or fetching watchlist: ", error);
        alert('Something went wrong signing you in. Please try again.');
    }
}

if (enterButton) {
    enterButton.addEventListener("click", handleLogin);

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
