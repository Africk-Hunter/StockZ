 

async function main() {
    const uri = "mongodb+srv://hunterafrick:qkVMAYk6YgLtKfQ2@stockz.abxj0i5.mongodb.net/";      
    const client = new MongoClient(uri);

    try {
        // Connect to the MongoDB cluster
        await client.connect();

        // Make the appropriate DB calls
        await  listDatabases(client);

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

async function listDatabases(client){
    databasesList = await client.db().admin().listDatabases();

    console.log("Databases:");
    databasesList.databases.forEach(db => console.log(` - ${db.name}`));
};

main().catch(console.error);

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
let stockDescLink      = document.getElementById("stockDescLink");

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
    var greatBRLow, greatBRHigh, goodBRLow, goodBRHigh, okayBRLow, okayBRHigh, badBRLow, badBRHigh;
    greatBRLow = data[0];
    greatBRHigh = greatBRLow + 2;
    goodBRLow = greatBRHigh + 2;
    goodBRHigh = goodBRLow + 2;
    okayBRLow = goodBRHigh + 2;
    okayBRHigh = okayBRLow + 2;
    badBRLow = okayBRHigh + 2;
    badBRHigh = badBRLow + 2;

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

