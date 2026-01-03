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
XHS_OUTPUT_BINARY := desktop/src-tauri/binaries/xhs-agent-$(TARGET_NAME:hyperagent-%=%)

# Build the sidecar executable for the detected OS/Arch.
# This replaces the static `npm run package` with a dynamic command.
build-sidecar: build-hyperagent build-xhs-agent

build-hyperagent:
	@echo ">>> Building hyperagent sidecar..."
	cd sidecar && npm install && npm run build
	@echo ">>> Packaging hyperagent for $(PKG_TARGET)..."
	cd sidecar && npx pkg dist/bundle/index.js --targets $(PKG_TARGET) --output ../$(OUTPUT_BINARY)
	@echo ">>> Copying hyperagent binary to desktop/binaries/..."
	cp $(OUTPUT_BINARY) desktop/binaries/

build-xhs-agent:
	@echo ">>> Building xhs-agent sidecar..."
	cd xhs_agent && npm install && npx tsc
	@echo ">>> Packaging xhs-agent for $(PKG_TARGET)..."
	cd xhs_agent && npx pkg dist/index.js --targets $(PKG_TARGET) --output ../$(XHS_OUTPUT_BINARY)
	@echo ">>> Copying xhs-agent binary to desktop/binaries/..."
	mkdir -p desktop/binaries
	cp $(XHS_OUTPUT_BINARY) desktop/binaries/
	@echo ">>> xhs-agent build complete."

# Clean up sidecar build artifacts.
# This removes installed node_modules, the dist folder, and any generated binary.
clean-sidecar:
	@echo ">>> Cleaning sidecar artifacts..."
	rm -rf sidecar/node_modules sidecar/dist xhs_agent/node_modules xhs_agent/dist
	rm -f desktop/src-tauri/binaries/hyperagent-* desktop/binaries/hyperagent-*
	rm -f desktop/src-tauri/binaries/xhs-agent-* desktop/binaries/xhs-agent-*
	@echo ">>> Sidecar clean complete."
