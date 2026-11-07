/** @type {import('tailwindcss').Config} */
// "Understory" design language. Every colour, font, size, motion value and cut
// lives here. `theme.colors`, `borderRadius` and `boxShadow` are replaced (not
// extended) so a stale class from the old palette, or any default Tailwind
// colour, radius or shadow, simply produces no CSS.
const plugin = require('tailwindcss/plugin');

const cutPolygon = (k) =>
  `polygon(${k} 0, 100% 0, 100% calc(100% - ${k}), calc(100% - ${k}) 100%, 0 100%, 0 ${k})`;

module.exports = {
  content: [
    "./public/**/*.html",
    "./public/src/**/*.{html,js,mjs}"
  ],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      deep: '#10241A',
      floor: '#1A3526',
      canopy: '#24432F',
      moss: '#3A6347',
      plate: 'rgba(242, 236, 210, 0.55)',
      cream: '#F2ECD2',
      sand: '#DCD3A6',
      lime: '#9BCB5E',
      amber: '#E8A93A',
      butter: '#F5DE82',
      ember: '#D9744A',
      bark: '#8A5A34',
      orchid: '#6B5A9A',
      ink: '#16301F',
      hairline: 'rgba(242, 236, 210, 0.22)',
      scrim: 'rgba(8, 18, 13, 0.7)',
      'band-great-1': '#9BCB5E',
      'band-great-2': '#6A9A3A',
      'band-good-1': '#F5DE82',
      'band-good-2': '#D2AE45',
      'band-okay-1': '#E07F52',
      'band-okay-2': '#B8532B',
      'band-bad-1': '#B8363B',
      'band-bad-2': '#8A2227',
    },
    borderRadius: {
      none: '0px',
      full: '9999px', // the lamp and the spinner only
    },
    boxShadow: {
      none: 'none',
      ring: 'inset 0 0 0 2px #9BCB5E',
      'underline-lime': 'inset 0 -3px 0 #9BCB5E',
      'underline-ember': 'inset 0 -2px 0 #D9744A',
      'underline-hairline': 'inset 0 -2px 0 rgba(242, 236, 210, 0.22)',
    },
    extend: {
      screens: {
        'tablet': '640px',
        'laptop': '1024px',
        'desktop': '1600px',
        'desktopXL': '1921px',
      },
      fontFamily: {
        display: ["'Microgramma D Extended'", "'Michroma'", "'Eurostile'", 'sans-serif'],
        body: ["'Barlow'", 'system-ui', 'sans-serif'],
        mono: ["'Azeret Mono'", 'ui-monospace', 'monospace'],
      },
      fontSize: {
        label: ['13px', { lineHeight: '1.25' }],
        mono: ['14px', { lineHeight: '1.25' }],
        small: ['15px', { lineHeight: '1.4' }],
        body: ['16px', { lineHeight: '1.55' }],
        value: ['18px', { lineHeight: '1.25' }],
        h3: ['18px', { lineHeight: '1.25' }],
        h2: ['30px', { lineHeight: '1.15' }],
        wordmark: ['36px', { lineHeight: '1' }],
        display: ['84px', { lineHeight: '1' }],
      },
      letterSpacing: {
        'caps-display': '.06em',
        'caps-title': '.1em',
        'caps-label': '.1em',
      },
      transitionDuration: {
        hover: '150ms',
        press: '120ms',
        fade: '200ms',
        arrive: '500ms',
        morph: '500ms',
      },
      transitionTimingFunction: {
        understory: 'cubic-bezier(.2,.7,.2,1)',
      },
      spacing: {
        grout: '2px',
      },
      maxWidth: {
        content: '1180px',
      },
      keyframes: {
        fade: { from: { opacity: '0' }, to: { opacity: '1' } },
        fadeout: { from: { opacity: '1' }, to: { opacity: '0' } },
        pulse: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '.55' } },
        spin: { to: { transform: 'rotate(360deg)' } },
        'spin-reverse': { from: { transform: 'rotate(360deg)' }, to: { transform: 'rotate(0deg)' } },
      },
      animation: {
        fade: 'fade 200ms ease-out both',
        arrive: 'fade 500ms ease-out both',
        fadeout: 'fadeout 200ms ease-in-out forwards',
        skeleton: 'pulse 1400ms ease-in-out infinite',
        spin: 'spin 1400ms linear infinite',
        'spin-reverse': 'spin-reverse 1000ms linear infinite',
      },
    },
  },
  plugins: [
    plugin(function ({ addUtilities, addVariant }) {
      // Cut corners: top-left and bottom-right, 45 degrees. clip-path clips
      // outlines and outside shadows, so focus is an inset ring (shadow-ring).
      addUtilities({
        '.cut-sm': { clipPath: cutPolygon('8px') },
        '.cut-md': { clipPath: cutPolygon('16px') },
        '.cut-lg': { clipPath: cutPolygon('32px') },
        '.cut-none': { clipPath: 'none' },
        // Tracked uppercase display labels. Tracking widens as size drops.
        // Small caps labels use Barlow 600: the extended display face is
        // single-weight and thin, and unreadable at label sizes.
        '.caps': {
          fontFamily: "'Barlow', system-ui, sans-serif",
          fontWeight: '600',
          textTransform: 'uppercase',
          letterSpacing: '.1em',
        },
        // The wide display face, for the wordmark and large headings only.
        '.caps-wide': {
          fontFamily: "'Microgramma D Extended', 'Michroma', 'Eurostile', sans-serif",
          fontWeight: '400',
        },
        '.caps-title': { letterSpacing: '.1em' },
        '.caps-display': { letterSpacing: '.06em' },
      });
      addVariant('selected', ['&[aria-pressed="true"]', '&.is-on']);
    }),
  ],
}
