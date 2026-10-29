# ನಮ್ಮ ಗಾಳಿ (Namma Gaali)

**Next-day AQI forecast for Bengaluru.** *Namma Gaali* (ನಮ್ಮ ಗಾಳಿ) means "our air" in Kannada.

A machine-learning model predicts the next day's Air Quality Index (AQI) for each of Bengaluru's 10 CPCB/KSPCB monitoring stations. A map-based website shows the forecast, recent readings, health precautions, and **how accurate the model is**, compared with a simple baseline.

> **Demo on historical data.** The site shows a snapshot of **14 March 2020**, the last normal day before the COVID lockdown. Each station's forecast for 15 March is shown next to what actually happened. The forecasting model was trained only on data before October 2019, so these are genuine out-of-sample predictions. With a live CPCB feed, the same pipeline would forecast tomorrow every day.

## What the website does
- Flies from a world view to India and then to Bengaluru.
- Shows each station on the map, coloured by its predicted AQI category.
- Click anywhere on the map (a mall, a road, your college) and it picks the **nearest station** and shows the distance.
- The left panel shows the latest recorded AQI, the predicted next-day AQI, recent readings, accuracy, and precautions based on India's National AQI categories.

## How it works
1. **Data:** daily AQI per station from the Kaggle dataset [Air Quality Data in India (2015–2020)](https://www.kaggle.com/datasets/rohanrao/air-quality-data-in-india), which is based on CPCB data. Only the Bengaluru stations are used.
2. **Features** (only what is known by the end of "today"): today's AQI, the AQI of the previous 1–3 days, the 7-day average, month, weekday and station. Missing days are kept as gaps, so "yesterday" always means the actual previous day.
3. **Time-based split:** the model trains on data before 1 Oct 2019 and is tested on 1 Oct 2019 – 14 Mar 2020. The COVID lockdown period is excluded because its air quality was abnormal.
4. **Model:** Gradient Boosting (scikit-learn `HistGradientBoostingRegressor`) trained on absolute error. It predicts the *change* from today's AQI.
5. **Baseline:** "tomorrow = today". The model is only useful if it beats this.
6. **Output:** the notebook exports `site/data.json` and `site/data.js`. The static website reads them.

## Results (test period: 1 Oct 2019 – 14 Mar 2020)

| | Avg error (MAE) | Big-miss error (RMSE) |
|---|---|---|
| Gradient Boosting | **13.8** | **23.2** |
| Baseline (tomorrow = today) | 14.4 | 25.4 |

Errors are in AQI points. The model beats the baseline at 8 of 10 stations, and the website shows the per-station numbers openly. Simpler attempts (Random Forest, Ridge regression) did *not* beat the baseline. Next-day AQI changes slowly, so "tomorrow = today" is a strong guess.

## Run it locally
```bash
pip install -r requirements.txt
jupyter notebook namma_gaali.ipynb   # run all cells -> writes site/data.json and site/data.js
```
Then open `site/index.html` in a browser.

## Deployment
The `site/` folder is a static website deployed on Vercel (Root Directory = `site`, no build step).

## Limitations and next steps
- The data ends in July 2020. **Next step:** connect the official real-time CPCB feed (data.gov.in) and re-run the forecast daily.
- Station coordinates are approximate.
- Only past AQI is used. Weather (wind, rain) would likely improve the forecasts.

## Tech
Python (pandas, scikit-learn) · MapLibre GL JS + OpenFreeMap tiles · HTML/CSS/JavaScript · Vercel
