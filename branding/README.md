# OXIDE branding

Ink + copper brand marks (not a jatos/dopamine clone).

| File | Size use | Where it appears |
|------|----------|------------------|
| `oxide-icon.png` | 512–1024 square | Discord **server icon** (upload manually), site `/oxide-icon.png` |
| `oxide-banner.png` | Wide 16:9 | Website header / marketing |
| `oxide-app-icon.png` | Square app mark | In-game menu sidebar (ImGui), boxes, watermarks |
| `oxide-favicon.png` | Simple mark | Site favicon (`gate-site/public/favicon.png`) |

## Discord

Server Settings → Overview → Icon → upload `oxide-icon.png`.

## Website

`gate-site` already references:

- Favicon: `/favicon.png`
- Nav mark: `/oxide-app-icon.png`
- Optional banner: `/oxide-banner.png`

## External menu

`External/assets/oxide-app-icon.png` is loaded at runtime (next to the EXE or from `External/assets/`) into the ImGui sidebar when DX11 + `stb_image` succeed. If the PNG is missing, the text “OXIDE” still shows.
