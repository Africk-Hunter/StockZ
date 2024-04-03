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

var enterButton         = document.getElementById("enterButton");
let logOutButton        = document.getElementById("logOutButton");
/* Nav Buttons */
let tickerInfoBtn       = document.getElementById("tickerInfoBtn");
let homeBtn             = document.getElementById("homeBtn");
let watchListBtn        = document.getElementById("watchListBtn");
/* Main Page */
const tickerParentBox   = document.getElementById("tickerParentBox");
const mainTickerInput   = document.getElementById("mainTickerInput");
const tickerSubmitBtn   = document.getElementById("tickerSubmitBtn");
/* Ticker Info Page */
let tickerLabelIP       = document.getElementById("tickerLabelIP");

let tickerValue = "";

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
        }, 200);

    });
    
}

if(!enterButton){
    tickerInfoBtn.addEventListener('click', function(){
        if (!document.URL.includes('tickerInfo.html')){
            window.location.href = 'tickerInfo.html';
        }
    });
    homeBtn.addEventListener('click', function(){
        if (!document.URL.includes('main.html')){
            window.location.href = 'main.html';
        }
    });
    watchListBtn.addEventListener('click', function(){
        if (!document.URL.includes('watchlist.html')){
            window.location.href = 'watchlist.html';
        }
    });
}

if(logOutButton){
    logOutButton.addEventListener('click', function() {
        document.getElementById('mainWrapper').classList.add('fadeAway');
        setTimeout(() => {
            window.location.href = ('./index.html');
        }, 500);
        
    });
}

if(tickerParentBox){
    mainTickerInput.addEventListener('input', function(){
        if(mainTickerInput.value != ""){
            tickerSubmitBtn.style.display = 'flex';
        } else{
            tickerSubmitBtn.style.display = 'none';
        }
    });
    tickerSubmitBtn.addEventListener('click', function() {

        tickerValue = mainTickerInput.value;
        tickerSubmitBtn.style.display = 'none';
        mainTickerInput.classList.add("sizeText");
        tickerParentBox.classList.add("moveUpBox");
        setTimeout(() => {
            window.location.href = ('./tickerInfo.html'); 
        }, 700);
        
    });
}

/*npx tailwindcss -i ./src/input.css -o ./src/output.css --watch*/ 