# Sidecar Build Instructions

The sidecar is a TypeScript-based Node.js application that is packaged into a standalone executable for use with the Tauri application.

## Prerequisites

- Node.js (version 18 or later)
- npm

## Build Process

The build is a multi-step process orchestrated by npm scripts defined in `sidecar/package.json`:

1.  **Installation**: `npm install` downloads all necessary `devDependencies` (like `typescript`, `@vercel/ncc`, and `pkg`) and `dependencies`.
2.  **Compilation & Bundling (`npm run build`)**: 
    - `tsc`: Compiles the TypeScript source files from `src/` into JavaScript files in `dist/`.
    - `ncc`: Takes the main compiled file (`dist/index.js`) and bundles it with all its Node.js dependencies into a single JavaScript file (`dist/bundle/index.js`).
3.  **Packaging (`npm run package`)**:
    - This script first runs the complete `build` step above.
    - `pkg`: Takes the bundled file from `ncc` and packages it into a native, standalone executable for macOS on ARM64 (`node18-macos-arm64`).
    - The final executable is placed at `desktop/src-tauri/binaries/hyperagent-aarch64-apple-darwin`, making it accessible to the Tauri application.

### Commands

To generate the sidecar executable, run the following command from the project root:

```sh
cd sidecar && npm install && npm run package
```

Alternatively, you can use the `Makefile` target:

```sh
make build-sidecar
```
