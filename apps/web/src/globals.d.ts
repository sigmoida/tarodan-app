// Ambient declaration for CSS side-effect imports (e.g. `import './globals.css'`).
// The bundler (webpack) handles CSS at build time; TypeScript has no built-in
// type for it, so without this the editor flags such imports as ts(2882)
// ("Cannot find module or type declarations for side-effect import").
declare module '*.css';
