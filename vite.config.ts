import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'vite';
import { adminPlugin } from './vite/admin-plugin';

// `npm run dev:phone` serves over HTTPS on the local network: phones only expose the motion
// sensors (tilt) to secure pages. The certificate is self-signed, so the phone warns once.
// The admin plugin adds the content dashboard (/admin) to the dev server only.
export default defineConfig(({ mode }) => ({
  plugins: [adminPlugin(), ...(mode === 'phone' ? [basicSsl({ name: 'portfolio-dev' })] : [])],
}));
