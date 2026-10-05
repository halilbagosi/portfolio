import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'vite';

// `npm run dev:phone` serves over HTTPS on the local network: phones only expose the motion
// sensors (tilt) to secure pages. The certificate is self-signed, so the phone warns once.
export default defineConfig(({ mode }) => ({
  plugins: mode === 'phone' ? [basicSsl({ name: 'portfolio-dev' })] : [],
}));
