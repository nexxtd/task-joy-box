import { defineConfig } from '../node_modules/vite/dist/node/index.js';
import react from '../node_modules/@vitejs/plugin-react/dist/index.js';

export default defineConfig({
  plugins: [react()],
  server: { port: 5199, strictPort: true },
});
