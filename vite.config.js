import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';

export default defineConfig({
  plugins: [
    glsl()
  ],
  assetsInclude: ['**/*.hdr', '**/*.ktx2', '**/*.glb'],
});
