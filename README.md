# Hackathon Foire du Valais 2026 (HackVS)


**Theme:** Can we anticipate staffing needs before they become critical?


https://github.com/user-attachments/assets/fa0bae63-4cce-4c55-89f8-70bd3e99669d


## Run the project

Requirements: Python ≥ 3.9 (no dependencies) and Node.js.

```bash
cd web
npm install
npm run dev        # http://localhost:5173
```


## Check the project health

```bash
python3 -m sources check           # are the public data sources responding?
python3 -m sources stats           # volume and freshness of the collected data
cd web && npx tsc -b               # TypeScript type check
npx oxlint src                     # front-end lint
```
