/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",

  ],
  theme: {
    extend: {
      colors: {
        'tabs': '#272a2f',
        'tab': '#1c1f24',
        'nav': '#505152',
        'wow': '#48ffcf',
        'flash': '#146953',
        'smooth': '#002427',
        'light': '#d9d9d9',
        'lightbg': '#286957',
        'lightgreen': '#094f2c',
        'list': '#272727',
      },
      backgroundImage: {
        'primary-gradient': 'linear-gradient(to right bottom, #6bd190, #53b484, #3f9876, #307c66, #266154, #256555, #246956, #246d56, #3b9162, #61b567, #92d965, #cefb5f)',
        'hover-gradient': 'linear-gradient(90deg, #4ab98d, #018f86 50.5%, #66c98c)',
        'coin-gradient': 'linear-gradient(192deg, rgb(102 201 140 / 60%) 13%, rgb(102 201 140 / 64%) 53%, rgb(11 209 196 / 52%) 100%)',
        'sidebar-gradient': 'linear-gradient(180deg, #55cb977a -30.98%, #0f212ede)',
        // 'banner-gradient': 'linear-gradient(180deg, #55cb977a -11.98%, #408f4b17)',
        'banner-gradient': 'linear-gradient(180deg, #55cb977a -30.98%, #0f212ede)',
        'dump-gradient': 'linear-gradient(180deg, #cb12127a -11.98%, #0f212e00)',
        'vs-gradient': 'linear-gradient(180deg, #000000 -11.98%, #007b28)',
        'spin-gradient': 'linear-gradient(180deg, #22312a -11.98%, #0f212e00)',
        'mine-gradient': 'linear-gradient(180deg,#55cb977a -30.98%,#0f212ede)',
        'light-gradient': 'linear-gradient(180deg, #eafff9 -30.98%, #6b9f85)',
        'lightcard-gradient': 'linear-gradient(-360deg, #8ead9e -30.98%, #346f5f)',
        'card-gradient': 'linear-gradient(180deg, #254938 -11.98%, #4d4d4d14)',
      },
      boxShadow: {
        'custom': '0 0px 11px #777777e0',
        'coin': '0 1px 17px #56d587',
        'pump': '0 0px 10px #48ffcf;',
        'dump': '0 0px 6px #f7e696;',
      },
      gridTemplateColumns: {
        '60-40': '60% 40%',
      },
    },
  },
  plugins: [],
};
