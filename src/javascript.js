import { initializeApp } from "firebase/app";
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

/* Initialize Firebase */

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

/* Elements */
var enterButton = document.getElementById("enterButton");

if(enterButton){
    enterButton.addEventListener("click", function() {
        document.getElementById("stockZ").classList.add("moved");
        var inputs = document.querySelectorAll('input[type="text"], input[type="password"]');
        inputs.forEach(function(input) {
            input.classList.add("fadeAway");
        });
        enterButton.classList.add("fadeAway");
    });
    
}
