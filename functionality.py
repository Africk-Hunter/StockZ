import requests
from bs4 import BeautifulSoup
import time

close_information = []

def scrape_stock_data(ticker):

    currentTime = str(int(time.time()))

    url = "https://finance.yahoo.com/quote/" + ticker.upper() + \
          "/history?frequency=1mo&period1=0&period2=" + currentTime
    print(url)

    # Define custom user-agent header
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

# Example usage
ticker_symbol = input("Enter the ticker symbol: ")
scrape_stock_data(ticker_symbol.upper())
print(close_information)
