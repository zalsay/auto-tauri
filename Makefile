.PHONY: build-sidecar clean-sidecar

# Detect OS and Architecture
OS := $(shell uname -s)
ARCH := $(shell uname -m)

# Default to Linux x64 as a fallback
PKG_TARGET := node18-linux-x64
TARGET_NAME := hyperagent-x86_64-unknown-linux-gnu

# macOS configuration
ifeq ($(OS), Darwin)
    ifeq ($(ARCH), arm64)
        # Apple Silicon
        PKG_TARGET := node18-macos-arm64
        TARGET_NAME := hyperagent-aarch64-apple-darwin
    else
        # Intel Mac
        PKG_TARGET := node18-macos-x64
        TARGET_NAME := hyperagent-x86_64-apple-darwin
    endif
endif

# Windows (via Git Bash/MinGW) configuration
ifneq (,$(findstring MINGW,$(OS)))
    # Assuming x64 for Windows
    PKG_TARGET := node18-win-x64
    TARGET_NAME := hyperagent-x86_64-pc-windows-msvc.exe
endif

OUTPUT_BINARY := desktop/src-tauri/binaries/$(TARGET_NAME)

# Build the sidecar executable for the detected OS/Arch.
# This replaces the static `npm run package` with a dynamic command.
build-sidecar:
	@echo ">>> Detected OS: $(OS), Arch: $(ARCH)"
	@echo ">>> Setting pkg target to: $(PKG_TARGET)"
	@echo ">>> Building sidecar..."
	cd sidecar && npm install && npm run build
	@echo ">>> Packaging for $(PKG_TARGET)..."
	cd sidecar && npx pkg dist/bundle/index.js --targets $(PKG_TARGET) --output ../$(OUTPUT_BINARY)
	@echo ">>> Copying binary to desktop/binaries/..."
	cp $(OUTPUT_BINARY) desktop/binaries/
	@echo ">>> Sidecar build complete. Executable is at $(OUTPUT_BINARY) and desktop/binaries/"

# Clean up sidecar build artifacts.
# This removes installed node_modules, the dist folder, and any generated binary.
clean-sidecar:
	@echo ">>> Cleaning sidecar artifacts..."
	rm -rf sidecar/node_modules sidecar/dist desktop/src-tauri/binaries/hyperagent-* desktop/binaries/hyperagent-*
	@echo ">>> Sidecar clean complete."
