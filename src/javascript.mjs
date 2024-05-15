const MAX_VALUE = 9999
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
let currentTicker       = "";
let stockStatsLink      = document.getElementById("stockStatsLink");
let stockDescLink       = document.getElementById("stockDescLink");

if (enterButton) {
    enterButton.addEventListener("click", function() {
        document.getElementById("stockZ").classList.add("fadeAway");
        var inputs = document.querySelectorAll('input[type="text"], input[type="password"]');
        inputs.forEach(function(input) {
            input.classList.add("fadeAway");
        });
        enterButton.classList.add("fadeAway");
        setTimeout(() => {
            window.location.href = ('/main');
        }, 200);
    });
}

else {
    tickerInfoBtn.addEventListener('click', function(){
        if (!document.URL.includes('tickerInfo.html')){
            window.location.href = '/tickerInfo';
        }
    });
    homeBtn.addEventListener('click', function(){
        if (!document.URL.includes('main.html')){
            window.location.href = '/main';
        }
    });
    watchListBtn.addEventListener('click', function(){
        if (!document.URL.includes('watchlist.html')){
            window.location.href = '/watchlist';
        }
    });
}

if (logOutButton) {
    logOutButton.addEventListener('click', function() {
        document.getElementById('mainWrapper').classList.add('fadeAway');
        setTimeout(() => {
            window.location.href = ('/');
        }, 500);
    });
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

    function tickerSubmit(){
        tickerValue = mainTickerInput.value;
        tickerSubmitBtn.style.display = 'none';
        mainTickerInput.classList.add("sizeText");
        tickerParentBox.classList.add("moveUpBox");
        currentTicker = tickerValue;
        getStockData(tickerValue.toUpperCase())
            .then(() => {
                window.location.href = ('/tickerInfo'); 
            })
            .catch(error => {
                console.error('Error occurred when retriving stock data: ', error);
            });
    }
    
}
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

    stockStatsLink.addEventListener('click', function() {
        var url = 'https://finance.yahoo.com/quote/' + ticker + '/';
        window.open(url, '_blank');
    });
    stockDescLink.addEventListener('click', function() {
        var url = 'https://finance.yahoo.com/quote/' + ticker + '/profile';
        window.open(url, '_blank');
    });
    tickerLabelIP.addEventListener('click', function(){
        
    })

}

function getStockData(ticker){
    return new Promise((resolve, reject) => {
        var xhttp = new XMLHttpRequest();

        xhttp.onreadystatechange = function() {
            if (this.readyState == 4 && this.status == 200) {
                var response = JSON.parse(this.responseText);
                runStockCalculations(response, ticker);
                resolve();
            }
        };
        xhttp.open("GET", "/run-calculations?ticker=" + ticker, true);
        xhttp.send();
    });
}


function runStockCalculations(data, ticker) {

    /* 
        1. Average change per month (percentage NOT $ amount)
            for(index, months)
                change[index] = months[index] - months[index + 1]
            sum all of change and find average
        2. Multiply average by current month (maybe)
        3. Find last dip (correction)
        4. Average change per month * months since the dip + value at the dip
        5. Result is the best possible value
        6. Max - min / 8

        Max Price = Price at start of year + (average change per month * months passed in the year)
                  = (3 * Dip Value + 1 * height before the dip value) / 4

        Potential
            1. find dip point
            2. search 1 year (arbitrary amount of time) in the future to find where it bottomed out
            3. log month of bottomed out
    */
    
    var greatBRLow, greatBRHigh, goodBRLow, goodBRHigh, okayBRLow, okayBRHigh, badBRLow, badBRHigh,
        averageMonthlyChange, priceInMiddleOfDip;

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
    localStorage.setItem('mostRecentCalculations', JSON.stringify(calculations));
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
            document.getElementById('grBL').innerHTML = "$" + calculations.greatBRLow.toFixed(2);
            document.getElementById('grBH').innerHTML = "$" + calculations.greatBRHigh.toFixed(2);
            document.getElementById('gBL').innerHTML = "$" + calculations.goodBRLow.toFixed(2);
            document.getElementById('gBH').innerHTML = "$" + calculations.goodBRHigh.toFixed(2);
            document.getElementById('oBL').innerHTML = "$" + calculations.okayBRLow.toFixed(2);
            document.getElementById('oBH').innerHTML = "$" + calculations.okayBRHigh.toFixed(2);
            document.getElementById('bBL').innerHTML = "$" + calculations.badBRLow.toFixed(2);
            document.getElementById('bBH').innerHTML = "$" + calculations.badBRHigh.toFixed(2);
            
        } else {
            console.log("No calculations found in localStorage.");
        }
    } catch (error) {
        console.log("Error occurred when loading data onto page.");
    }
    
}

function findDipInformation(closeData){

    let monthScore = 1, 
        monthScoreMonthlyChange = 0.01,
        highestScore = 0,
        lowestMonth,
        lowestPrice,
        dipHolder, dipHolderPrice;

    for (let index = 0; index < closeData.length - 1; index++) {
        monthScore -= monthScoreMonthlyChange; //Adjust monthly score per month
        let changeRatio = 1 - (closeData[index] / closeData[index + 1]);
        
        if(changeRatio > .10){ // If the drop in a month exceeds the threshold, go 12 months in the future and find where it bottoms out
            let localLowestPrice = MAX_VALUE,
                localLowestMonth,
                secondaryMonthScore = monthScore,
                localDipHolder = index,
                localDipHolderPrice = closeData[index - 1];

            for (let lowestPointIndex = index; lowestPointIndex > index - 12; lowestPointIndex--) { //Move 12 months in the future to find where it bottoms out
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
    return( [lowestMonth, lowestPrice, dipHolder, dipHolderPrice] );
}

function calculateScore(monthlyScore, changeRatio){
    return monthlyScore + changeRatio;
}

