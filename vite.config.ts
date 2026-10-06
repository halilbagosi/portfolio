import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'vite';
import { adminPlugin } from './vite/admin-plugin';

// `npm run dev:phone` serves over HTTPS on the local network: phones only expose the motion
// sensors (tilt) to secure pages. The certificate is self-signed, so the phone warns once.
// The admin plugin adds the content dashboard (/admin) to the dev server only.
// BASE_PATH is where a build will be published (GitHub Pages: /<repo>/); the deploy workflow
// sets it. Dev always serves from /, so the dashboard and its preview keep their URLs.
export default defineConfig(({ command, mode }) => ({
  base: command === 'build' ? (process.env.BASE_PATH ?? '/') : '/',
  plugins: [adminPlugin(), ...(mode === 'phone' ? [basicSsl({ name: 'portfolio-dev' })] : [])],
}));
