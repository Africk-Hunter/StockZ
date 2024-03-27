/* import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {

  apiKey: "AIzaSyAuxROpJhqJ4-fgIC4xwNYV5ycd0O_QCO4",
  authDomain: "stockz-1d5ca.firebaseapp.com",
  projectId: "stockz-1d5ca",
  storageBucket: "stockz-1d5ca.appspot.com",
  messagingSenderId: "853457963776",
  appId: "1:853457963776:web:0cae1e3883c0195f6681e5",
  measurementId: "G-80DCFJFT65"

};


const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app); */

/* Elements */
var enterButton = document.getElementById("enterButton");
let logOutButton = document.getElementById("logOutButton");
const mainTickerInput = document.getElementById("mainTickerInput");
const tickerSubmitBtn = document.getElementById("tickerSubmitBtn");

if(enterButton){
    enterButton.addEventListener("click", function() {
        document.getElementById("stockZ").classList.add("fadeAway");
        var inputs = document.querySelectorAll('input[type="text"], input[type="password"]');
        inputs.forEach(function(input) {
            input.classList.add("fadeAway");
        });
        enterButton.classList.add("fadeAway");
        setTimeout(() => {
            window.location.href = ('./main.html');
        }, 500);

    });
    
}

if(mainTickerInput){
    logOutButton.addEventListener('click', function() {
        document.getElementById('mainWrapper').classList.add('fadeAway');
        setTimeout(() => {
            window.location.href = ('./index.html');
        }, 500);
        
    });
    mainTickerInput.addEventListener('input', function(){
        if(mainTickerInput.value != ""){
            tickerSubmitBtn.style.display = 'flex';
        } else{
            tickerSubmitBtn.style.display = 'none';
        }
    });
}

/*npx tailwindcss -i ./src/input.css -o ./src/output.css --watch*/ 