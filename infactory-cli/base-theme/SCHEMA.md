# Ghost Theme SCHEMA

## Pflichtdateien

- `index.hbs` — Haupt-Template
- `post.hbs` — Einzelner Beitrag
- `page.hbs` — Statische Seite
- `tag.hbs` — Tag-Archiv
- `author.hbs` — Autor-Archiv
- `error.hbs` — Fehlerseite
- `package.json` — Theme-Metadaten

## Partials (empfohlen)

- `partials/navigation.hbs`
- `partials/pagination.hbs`
- `partials/post-card.hbs`

## Ghost Helpers (wichtigste)

```handlebars
{{ghost_head}}         ← CSS/Meta/OG-Tags (PFLICHT im <head>)
{{ghost_foot}}         ← JS-Skripte (PFLICHT vor </body>)
{{navigation}}         ← Hauptnavigation
{{#foreach posts}}     ← Posts iterieren
{{#post}}              ← Post-Kontext
{{asset "css/screen.css"}}  ← Asset-Pfade
```
