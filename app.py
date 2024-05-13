from flask import Flask, render_template, jsonify, request
import requests
from bs4 import BeautifulSoup
import time

app = Flask(__name__, static_folder='src')
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/main')
def main():
    return render_template('main.html')

@app.route('/tickerInfo')
def ticker_info():
    return render_template('tickerInfo.html')

@app.route('/watchlist')
def watchlist():
    return render_template('WatchList.html')

@app.route('/run-calculations')
def run_calculations():
    close_information = []

    def scrape_stock_data(ticker):
        currentTime = str(int(time.time()))
        url = "https://finance.yahoo.com/quote/" + ticker.upper() + "/history?frequency=1mo&period1=0&period2=" + currentTime
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'
        }
        response = requests.get(url, headers=headers)

        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')
            historical_table = soup.find('table', class_='table svelte-ewueuo')

            if historical_table:
                rows = historical_table.find_all('tr')

                for row in rows:
                    cells = row.find_all('td')
                    if len(cells) >= 4:
                        close_information.append(float(cells[5].text))
            else:
                print("Historical data not found on the page.")
        else:
            print("Failed to retrieve data. Status code:", response.status_code)

        return close_information  

    ticker_symbol = request.args.get('ticker')
    if ticker_symbol:
        close_information = scrape_stock_data(ticker_symbol.upper())
        return jsonify(close_information)
    else:
        return jsonify({"error": "Ticker symbol not provided."}), 400


if __name__ == '__main__':
    app.run(debug=True)