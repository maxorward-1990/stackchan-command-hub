# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

## StackChan Command Hub

### Kör lokalt (krävs för att nå roboten)
Webbläsare blockerar anrop från en https-sida till `http://192.168.x.x`. Kör därför appen lokalt över http:
```
bun install && bun run dev   # öppna http://localhost:8080
```

### Robot API (firmware-kontrakt)
Appen skickar enkla GET-anrop till `http://<IP>`. Din StackChan-firmware behöver exponera:
| Endpoint | Parametrar |
|---|---|
| `/api/servo` | `pan` (-90..90), `tilt` (-30..30) |
| `/api/face` | `expr` = happy/neutral/focused/angry/surprised/sleepy |
| `/api/led` | `mode` = solid/pulse/rainbow/alert/off, `color` = hex utan # |
| `/api/say` | `text` |
| `/api/capture.jpg` | returnerar JPEG |

Ändra sökvägarna i `src/lib/robot.ts` om din firmware använder andra.


## Anslutning
All styrning (status, huvud, ansikte, lampor, tal, inställningar, skills) går via USB-kabel (Chrome/Edge, firmware v14+) eller via bryggan:

    node tools/robot-proxy.mjs 192.168.0.188

Kamerabilden visas bara via bryggan.
