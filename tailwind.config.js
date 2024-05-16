/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
          "./dist/*.{html,js}",
          "./src/*.{html,js}",
          "./templates/*.{html,js}"
          ],
  theme: {
    extend: {
      colors: {
        'background': '#111311',
        'text-color': '#E4ECE4',
        'secondary-color': '#425C52',
        'accent-color': '#44B735',
        'great-buy-one': '#44B735',
        'great-buy-two': '#54A64A',
        'good-buy-one': '#E6EA33',
        'good-buy-two': '#CCCE4D',
        'okay-buy-one': '#E18026',
        'okay-buy-two': '#CE934D',
        'desperate-buy-one': '#EA3333',
        'desperate-buy-two': '#CE4C4C',
      },
      screens: {
        'tablet': '640px',
        // => @media (min-width: 640px) { ... }
  
        'laptop': '1024px',
        // => @media (min-width: 1024px) { ... }
  
        'desktop': '1921px',
        // => @media (min-width: 1280px) { ... }
      },
      fontFamily: {
        'poppins': ['Poppins', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

