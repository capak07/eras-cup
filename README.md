# The Eras Cup

A static site for battling Taylor Swift songs head to head until one champion is left.

## Run it

Open `index.html` in a browser, or serve the folder:

```
npx serve .
```

## Deploy it

Four static files (`index.html`, `styles.css`, `app.js`, `songs.js`), no build step.
Drag the folder onto Netlify Drop, or push it to GitHub Pages, Vercel or Cloudflare Pages.

## Change the song list

Edit `songs.js`. Each song is `{ t: title, a: album, e: era key, y: year, by: other artists }`.
Titles must be unique. Era keys match the `--era-*` colors in `styles.css`.
