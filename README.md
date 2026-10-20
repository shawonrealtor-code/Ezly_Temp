# Ezly Agency

A small insurance agency management app inspired by the feature set of EZLynx
(agency management + personal-lines comparative rater).

## Features
- **Dashboard**: client and policy counts, written premium, renewals due in 60 days
- **Clients (CRM)**: add leads/prospects/customers
- **Quote Rater**: enter a risk once, compare premiums across carriers, bind the chosen quote
- **Policies**: view, renew (+1 year), or cancel

Carrier rates are simulated; real carrier rating would need carrier API integrations.
Data is stored in the browser's localStorage.

## Run
Open `index.html` in a browser, or serve the folder: `python3 -m http.server 8000`.
