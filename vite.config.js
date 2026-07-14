import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';

export default defineConfig({
  base: '/oak-portfolio/',
  plugins: [
    glsl()
  ],
  assetsInclude: ['**/*.hdr', '**/*.ktx2', '**/*.glb'],
});
