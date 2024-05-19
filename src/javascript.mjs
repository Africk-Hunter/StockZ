import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'
import { getAuth, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
import { getFirestore, collection, setDoc, getDocs, doc, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'

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
const db = getFirestore(app);
const auth = getAuth(app);

const MAX_VALUE             = 9999;
let currentTicker           = "";
/* Elements */
var enterButton             = document.getElementById("enterButton");
let logOutButton            = document.getElementById("logOutButton");
let inputUsername           = document.getElementById('inputUsername');
let inputPassword           = document.getElementById('inputPassword');
/* Nav Buttons */
let tickerInfoBtn           = document.getElementById("tickerInfoBtn");
let homeBtn                 = document.getElementById("homeBtn");
let watchListBtn            = document.getElementById("watchListBtn");
/* Main Page */
const tickerParentBox       = document.getElementById("tickerParentBox");
const mainTickerInput       = document.getElementById("mainTickerInput");
const tickerSubmitBtn       = document.getElementById("tickerSubmitBtn");
/* Ticker Info Page */
let tickerLabelIP           = document.getElementById("tickerLabelIP");
let stockStatsLink          = document.getElementById("stockStatsLink");
let stockDescLink           = document.getElementById("stockDescLink");
let addToWatchlist          = document.getElementById("addToWatchlist");
/* Watch List Page */
let watchlistItemsContainer = document.getElementById("watchlistItemsContainer");
let refreshButton           = document.getElementById("refreshButton");
let watchListContainerLarge = document.getElementById("watchListContainerLarge");

auth.onAuthStateChanged((user) => {
    if (user) {
        if (watchlistItemsContainer) {
            runWatchlist(user);
        }
    }
});


async function loginUser(username, password) {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, username, password);
      return userCredential.user;
    } catch (error) {
      console.error("Error logging in: ", error);
      
      return null;
    }
  }
  function handleLogin() {
    const username = inputUsername.value;
    const password = inputPassword.value;

    loginUser(username, password).then((user) => {
    if (username == "") {
        inputUsername.style.background = "red";
    }
    if (password == "") {
        inputPassword.style.background = "red";
    }
    inputPassword.addEventListener('click', function () {
        inputPassword.style.background = '#E4ECE4';
    });
    inputUsername.addEventListener('click', function () {
        inputUsername.style.background = '#E4ECE4';
    });

    if (user) {
        document.getElementById("stockZ").classList.add("fadeAway");
        var inputs = document.querySelectorAll('input[type="text"], input[type="password"]');
        inputs.forEach(function (input) {
            input.classList.add("fadeAway");
        });
        enterButton.classList.add("fadeAway");
        setTimeout(() => {
            window.location.href = '/main';
        }, 200);
    }
    });
  }
  
  if (enterButton) {
    enterButton.addEventListener("click", handleLogin);
  
    inputUsername.addEventListener("keypress", function (event) {
      if (event.key === "Enter") {
        handleLogin();
      }
    });
  
    inputPassword.addEventListener("keypress", function (event) {
      if (event.key === "Enter") {
        handleLogin();
      }
    });
  } else {
    tickerInfoBtn.addEventListener('click', function () {
      if (!document.URL.includes('tickerInfo.html')) {
        window.location.href = '/tickerInfo';
      }
    });
    homeBtn.addEventListener('click', function () {
      if (!document.URL.includes('main.html')) {
        window.location.href = '/main';
      }
    });
    watchListBtn.addEventListener('click', function () {
      if (!document.URL.includes('watchlist.html')) {
        window.location.href = '/watchlist';
      }
    });
  }

if (logOutButton) {
    logOutButton.addEventListener('click', function() {
        logOutUser();
    });
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

if (tickerParentBox) {
    mainTickerInput.addEventListener('input', function(){
        if(mainTickerInput.value != ""){
            tickerSubmitBtn.style.display = 'flex';
        } else{
            tickerSubmitBtn.style.display = 'none';
        }
    });
    tickerSubmitBtn.addEventListener('click', function() {
        tickerSubmit();
    });
    mainTickerInput.addEventListener("keypress", function (event) {
        if (event.key === "Enter" && mainTickerInput.value != "") {
            event.preventDefault();
            tickerSubmit();
        }
    });
}

function tickerSubmit(){
    let tickerValue = mainTickerInput.value;
    tickerSubmitBtn.style.display = 'none';
    mainTickerInput.classList.add("sizeText");
    tickerParentBox.classList.add("moveUpBox");
    currentTicker = tickerValue;
    getStockData(tickerValue.toUpperCase(), 'mostRecentData')
        .then(() => {
            var storageItem = localStorage.getItem('mostRecentData');
            var data = JSON.parse(storageItem);
            runStockCalculations(data, tickerValue, 'mostRecentCalculations');
            window.location.href = ('/tickerInfo'); 
        })
        .catch(error => {
            console.error('Error occurred when retriving stock data: ', error);
        });
}

/* Ticker Info Page */
if (tickerLabelIP) {
    loadCalculatedValues();
    let ticker = "";
    var storageItem = localStorage.getItem('mostRecentCalculations');
    if (storageItem) {
        var calculations = JSON.parse(storageItem);
        ticker = calculations.ticker;
    } else {
        console.log("No calculations found in localStorage.");
    }

    var recentData = localStorage.getItem('mostRecentData');
    try {
        if (recentData) {
            var data = JSON.parse(recentData);
            createStockChart(data);
        } else {
            console.log("No data was found in localStorage.");
        }
    } catch (error) {
        console.log("Error occurred when loading data.");
    }


    stockStatsLink.addEventListener('click', function() {
        var url = 'https://finance.yahoo.com/quote/' + ticker + '/';
        window.open(url, '_blank');
    });
    stockDescLink.addEventListener('click', function() {
        var url = 'https://finance.yahoo.com/quote/' + ticker + '/profile';
        window.open(url, '_blank');
    });
    tickerLabelIP.addEventListener('click', function(){
        document.getElementById('buyHolder').style.display = 'none';
        document.getElementById('stockChart').style.display = 'none';
        document.getElementById('otherButtons').style.display = 'none';
        tickerLabelIP.innerHTML = "";
        tickerLabelIP.classList.add("moveDownBox");
        setTimeout(() => {
            window.location.href = ('/main'); 
        }, 500);
    })
    addToWatchlist.addEventListener('click', function(){
        const user = auth.currentUser;
        if (user) {
            addToWatchlistFunc(tickerLabelIP.innerHTML.toUpperCase(), user.uid);
          } else {
            console.error("No user is signed in. " + error);
          }
    })
}

async function addToWatchlistFunc(ticker, uid) {
    const userDocRef = doc(db, `users/${uid}/watchlist`, ticker);
    try {
        await setDoc(userDocRef, { ticker: ticker });
    } catch (e) {
        console.error("Error adding document: ", e);
    }
}

/* Watch List page*/
if(watchlistItemsContainer){
    refreshButton.addEventListener('click', async function(){
        const user = auth.currentUser;
        if (user) {
            runWatchlist(user);
        } else {
            console.error("No user is signed in.");
        }
    });
}

async function runWatchlist(user){
    const watchlistItems = await fetchWatchlistItems(user.uid);
    updateWatchlistUI(watchlistItems);
}

async function fetchWatchlistItems(uid) {
    const watchlistCollectionRef = collection(db, `users/${uid}/watchlist`);
    try {
        const querySnapshot = await getDocs(watchlistCollectionRef);
        let watchlistItems = [];
        querySnapshot.forEach((doc) => {
            watchlistItems.push(doc.id);
        });
        return watchlistItems;
    } catch (e) {
        console.error("Error fetching watchlist items: ", e);
        return [];
    }
}

function updateWatchlistUI(tickers) {
    const watchlistItemsContainer = document.getElementById('watchlistItemsContainer');
    watchlistItemsContainer.innerHTML = '';

    tickers.forEach(ticker => {
        const stockContainer = createStockContainerItem(ticker);
        watchlistItemsContainer.appendChild(stockContainer);
    });
}

function createStockContainerItem(ticker) {
    let gbPrice, bbPrice;

    const container = document.createElement('div');
    container.className = 'stock-container';

    const stockItem = document.createElement('div');
    stockItem.className = 'stock-item flex w-full h-7 laptop:h-9 text-background text-lg laptop:text-2xl select-none font-semibold transition-all duration-150 ease-in-out';

    const nameDiv = document.createElement('div');
    nameDiv.className = 'flex h-full w-1/3 justify-center items-center bg-text-color rounded-l border-r select-none hover:cursor-pointer border-background transition-all duration-150 ease-in-out';
    nameDiv.textContent = ticker;

    const gbPriceDiv = document.createElement('div');
    gbPriceDiv.className = 'flex h-full w-1/3 justify-center items-center bg-great-buy-one border-r select-none border-background transition-all duration-150 ease-in-out';

    const bbPriceDiv = document.createElement('div');
    bbPriceDiv.className = 'flex h-full w-1/3 justify-center items-center bg-desperate-buy-one rounded-r select-none transition-all duration-150 ease-in-out';

    const deleteIcon = document.createElement('button');
    deleteIcon.className = 'delete-icon flex h-full w-10 justify-center items-center bg-none rounded border-solid border border-text-color border-opacity-25 ml-auto hover:bg-text-color';
    deleteIcon.id = "watchlistDeleteButton";
    deleteIcon.innerHTML = '<img class="h-full w-4/5" src="../src/trashcan.svg" alt="Delete">';
    deleteIcon.style.display = 'none'; 

    nameDiv.addEventListener('transitionend', handleTransitionEnd);
    gbPriceDiv.addEventListener('transitionend', handleTransitionEnd);
    bbPriceDiv.addEventListener('transitionend', handleTransitionEnd);
    
    stockItem.addEventListener('mouseenter', function() {
        shrinkWatchlistItem();
    });

    stockItem.addEventListener('mouseleave', function() {
        deleteIcon.style.display = 'none';
        unshrinkWatchlistItem()
    });

    function shrinkWatchlistItem(){
        nameDiv.classList.add("shrinkWaitlistBox");
        gbPriceDiv.classList.add("shrinkWaitlistBox");
        bbPriceDiv.classList.add("shrinkWaitlistBox");
    }
    function unshrinkWatchlistItem(){
        nameDiv.classList.remove("shrinkWaitlistBox");
        gbPriceDiv.classList.remove("shrinkWaitlistBox");
        bbPriceDiv.classList.remove("shrinkWaitlistBox");
    }
    
    function handleTransitionEnd() {
        if (checkIfClassIsApplied()) {
            deleteIcon.style.display = 'flex';
        }
    }
    function checkIfClassIsApplied(){
        return (
            nameDiv.classList.contains("shrinkWaitlistBox") &&
            gbPriceDiv.classList.contains("shrinkWaitlistBox") &&
            bbPriceDiv.classList.contains("shrinkWaitlistBox")
        )
    }
    
    nameDiv.addEventListener('click', function(){
        watchListContainerLarge.classList.add("fadeAway");
        getStockData(nameDiv.textContent, 'mostRecentData')
        .then(() => {
            var storageItem = localStorage.getItem('mostRecentData');
            var data = JSON.parse(storageItem);
            runStockCalculations(data, nameDiv.textContent, 'mostRecentCalculations');
            window.location.href = ('/tickerInfo'); 
        })
        .catch(error => {
            console.error('Error occurred when retriving stock data: ', error);
        });
    })

    deleteIcon.addEventListener('click', function(){
        deleteFromFirebase(nameDiv.textContent);
        stockItem.remove();
    });

    getStockData(ticker, 'watchListData')
        .then(() => {
            var watchListData = localStorage.getItem('watchListData');
            var data = JSON.parse(watchListData);
            runStockCalculations(data, ticker, 'watchListCalculations');
            var localCalculations = localStorage.getItem('watchListCalculations');

            try {
                if (localCalculations) {
                    var calculations = JSON.parse(localCalculations);
                    gbPrice = calculations.greatBRLow.toFixed(2);
                    bbPrice = calculations.badBRHigh.toFixed(2);
                    gbPriceDiv.textContent = gbPrice;
                    bbPriceDiv.textContent = bbPrice;
                    stockItem.appendChild(nameDiv);
                    stockItem.appendChild(gbPriceDiv);
                    stockItem.appendChild(bbPriceDiv);
                    stockItem.appendChild(deleteIcon);
            
                    container.appendChild(stockItem);
                } else {
                    console.log("No calculations found in localStorage.");
                }
            } catch (error) {
                console.log("Error occurred when loading data onto page.", error);
            }
        })
        .catch(error => {
            console.error('Error occurred when retrieving stock data: ', error);
        });



    return container;
}

async function deleteFromFirebase(ticker) {
    const user = auth.currentUser;
    if (user) {
        const watchlistCollectionRef = collection(db, `users/${user.uid}/watchlist`);
        const querySnapshot = await getDocs(watchlistCollectionRef);
        querySnapshot.forEach(async (doc) => {
            if (doc.id === ticker) {
                try {
                    await deleteDoc(doc.ref);
                } catch (error) {
                    console.error("Error deleting document: ", error);
                }
            }
        });
    } else {
        console.error("No user is signed in.");
    }
}


function getStockData(ticker, localStorageItem){
    return new Promise((resolve, reject) => {
        var xhttp = new XMLHttpRequest();

        xhttp.onreadystatechange = function() {
            if (this.readyState == 4 && this.status == 200) {
                var response = JSON.parse(this.responseText);
                localStorage.setItem(localStorageItem, JSON.stringify(response));
                resolve();
            }
        };
        xhttp.open("GET", "/run-calculations?ticker=" + ticker, true);
        xhttp.send();
    });
}

function runStockCalculations(data, ticker, localStorageItem) {

    var greatBRLow, greatBRHigh, goodBRLow, goodBRHigh, okayBRLow, okayBRHigh, badBRLow, badBRHigh,
        averageMonthlyChange, priceInMiddleOfDip, monthsInMiddleOfDip;

    averageMonthlyChange = calculateAverageMonthlyChange(data);
    const [dipMonth, dipPrice, dipHolder, dipHolderPrice] = findDipInformation(data);
    let min = dipPrice + (dipMonth * (averageMonthlyChange * dipPrice));
    
    priceInMiddleOfDip = (((3 * dipPrice) + (dipHolderPrice)) / 4);
    monthsInMiddleOfDip = (dipHolder + dipMonth) / 2

    let max = ((priceInMiddleOfDip * averageMonthlyChange) * monthsInMiddleOfDip) + priceInMiddleOfDip;
    let amountChange = (max - min) / 8;

    greatBRLow = min;
    greatBRHigh = greatBRLow + amountChange;
    goodBRLow = greatBRHigh + amountChange;
    goodBRHigh = goodBRLow + amountChange;
    okayBRLow = goodBRHigh + amountChange;
    okayBRHigh = okayBRLow + amountChange;
    badBRLow = okayBRHigh + amountChange;
    badBRHigh = max;

    var calculations = {
        ticker: ticker,
        greatBRLow: greatBRLow,
        greatBRHigh: greatBRHigh,
        goodBRLow: goodBRLow,
        goodBRHigh: goodBRHigh,
        okayBRLow: okayBRLow,
        okayBRHigh: okayBRHigh,
        badBRLow: badBRLow,
        badBRHigh: badBRHigh
    };
    console.log(localStorageItem);
    localStorage.setItem(localStorageItem, JSON.stringify(calculations));
}

function calculateAverageMonthlyChange(closeData){

    let monthlyChange = 0;
    let index = 1;
    for (index; index < closeData.length - 1; index++) {
        monthlyChange += (closeData[index] / closeData[index + 1]);
    }
    monthlyChange /= (index - 1);
    monthlyChange -= 1;
    return monthlyChange;
}

function loadCalculatedValues() {
    var storageItem = localStorage.getItem('mostRecentCalculations');
    try {
        if (storageItem) {
            var calculations = JSON.parse(storageItem);
            
            tickerLabelIP.innerHTML = calculations.ticker;
            assignValueOnScreen('grBL', calculations.greatBRLow);
            assignValueOnScreen('grBH', calculations.greatBRHigh);
            assignValueOnScreen('gBL', calculations.goodBRLow);
            assignValueOnScreen('gBH', calculations.goodBRHigh);
            assignValueOnScreen('oBL', calculations.okayBRLow);
            assignValueOnScreen('oBH', calculations.okayBRHigh);
            assignValueOnScreen('bBL', calculations.badBRLow);
            assignValueOnScreen('bBH', calculations.badBRHigh);
            
        } else {
            console.log("No calculations found in localStorage.");
        }
    } catch (error) {
        console.log("Error occurred when loading data onto page.", error);
    }
}

function assignValueOnScreen(id, value){
    if (value !== null && value !== undefined) {
        document.getElementById(id).innerHTML = "$" + value.toFixed(2);
    } else {
        console.error(`Value for ${id} is null or undefined:`, value);
        document.getElementById(id).innerHTML = "N/A";
    }
}


function findDipInformation(closeData){

    let monthScore = 1, 
        monthScoreMonthlyChange = 0.01,
        highestScore = 0,
        threshHoldValue = .10,
        lowestMonth,
        lowestPrice,
        dipHolder, dipHolderPrice;

    //If the threshold isn't met, lower the threshold
    while (performDipLoop() == 0 && threshHoldValue > 0){
        threshHoldValue -= .03;
    }
    
    return( [lowestMonth, lowestPrice, dipHolder, dipHolderPrice] );

    function performDipLoop(){
        for (let index = 0; index < closeData.length - 1; index++) {
            monthScore -= monthScoreMonthlyChange; //Adjust monthly score per month
            let changeRatio = 1 - (closeData[index] / closeData[index + 1]);
            
            if(changeRatio > threshHoldValue){ // If the drop in a month exceeds the threshold, go 12 months in the future and find where it bottoms out
                let localLowestPrice = MAX_VALUE,
                    localLowestMonth,
                    secondaryMonthScore = monthScore,
                    localDipHolder = index,
                    localDipHolderPrice = closeData[index - 1];
    
                    for (let lowestPointIndex = index; lowestPointIndex > index - 12 && lowestPointIndex >= 0; lowestPointIndex--) {  //Move 12 months in the future to find where it bottoms out
                        secondaryMonthScore += monthScoreMonthlyChange;
                        if(closeData[lowestPointIndex] < localLowestPrice){
                            localLowestPrice = closeData[lowestPointIndex];
                            localLowestMonth = lowestPointIndex - 1;
                        }
                    }
                let weightedChange = 2 * changeRatio;
                if(calculateScore(secondaryMonthScore, weightedChange) > highestScore){
                    highestScore = calculateScore(secondaryMonthScore, weightedChange);
                    lowestMonth = localLowestMonth;
                    lowestPrice = localLowestPrice;
                    dipHolder = localDipHolder;
                    dipHolderPrice = localDipHolderPrice;
                }
                
            }
        }
        return highestScore;
    }
}

function calculateScore(monthlyScore, changeRatio){
    return monthlyScore + changeRatio;
}

function createStockChart(prices) {
    var ctx = document.getElementById('stockChart').getContext('2d');
    let color = 'rgb(3, 172, 19)';
    let colorTrans = 'rgb(3, 172, 19, .2)';
    if (prices[0] < prices[prices.length - 1]) {
        color = 'rgb(255, 99, 132)';
        colorTrans = 'rgba(255, 99, 132, 0.2)';
    }

    prices.reverse();
    
    let currentDate = new Date();
    let reversedLabels = Array.from({ length: prices.length }, (_, i) => {
        let date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
        return date.toLocaleDateString();
    }).reverse();

    var stockChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: reversedLabels, 
            datasets: [{
                label: 'Stock Price',
                data: prices,
                borderColor: color,
                backgroundColor: colorTrans,
                borderWidth: 1,
                fill: true
            }]
        },
        options: {
            scales: {
                x: {
                    ticks: {
                        font: {
                            size: 35
                        },
                        maxRotation: 90,
                        minRotation: 90,
                    },
                    title: {
                        display: true,
                        text: 'Date',
                        font: {
                            size: 45
                        }
                    }
                },
                y: {
                    ticks: {
                        font: {
                            size: 35
                        }
                    },
                    title: {
                        display: true,
                        text: 'Stock Price',
                        font: {
                            size: 45
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}





