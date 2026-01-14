.PHONY: build-sidecar clean-sidecar

# Detect OS and Architecture
OS := $(shell uname -s)
ARCH := $(shell uname -m)

# Default to Linux x64 as a fallback
PKG_TARGET := node18-linux-x64
SIDECAR_NAME := sidecar-x86_64-unknown-linux-gnu
XHS_AGENT_NAME := xhs-agent-x86_64-unknown-linux-gnu

# macOS configuration
ifeq ($(OS), Darwin)
    ifeq ($(ARCH), arm64)
        # Apple Silicon
        PKG_TARGET := node18-macos-arm64
        SIDECAR_NAME := sidecar-aarch64-apple-darwin
        XHS_AGENT_NAME := xhs-agent-aarch64-apple-darwin
    else
        # Intel Mac
        PKG_TARGET := node18-macos-x64
        SIDECAR_NAME := sidecar-x86_64-apple-darwin
        XHS_AGENT_NAME := xhs-agent-x86_64-apple-darwin
    endif
endif

# Windows (via Git Bash/MinGW) configuration
ifneq (,$(findstring MINGW,$(OS)))
    PKG_TARGET := node18-win-x64
    SIDECAR_NAME := sidecar-x86_64-pc-windows-msvc.exe
    XHS_AGENT_NAME := xhs-agent-x86_64-pc-windows-msvc.exe
endif

# Output paths - all binaries go to framework/src-tauri/binaries/
BINARIES_DIR := framework/src-tauri/binaries
SIDECAR_OUTPUT := $(BINARIES_DIR)/$(SIDECAR_NAME)
XHS_AGENT_OUTPUT := $(BINARIES_DIR)/$(XHS_AGENT_NAME)

# Build all sidecars
build-sidecar: build-hyperagent build-xhs-agent

build-hyperagent:
	@echo ">>> Building sidecar (hyperagent)..."
	cd framework/sidecar && npm install && npm run build
	@echo ">>> Packaging sidecar for $(PKG_TARGET)..."
	cd framework/sidecar && npx pkg dist/bundle/index.js --targets $(PKG_TARGET) --output ../src-tauri/binaries/$(SIDECAR_NAME)

build-xhs-agent:
	@echo ">>> Building xhs-agent sidecar..."
	cd xhs_agent && npm install && npx tsc
	@echo ">>> Packaging xhs-agent for $(PKG_TARGET)..."
	cd xhs_agent && npx pkg dist/index.js --targets $(PKG_TARGET) --output ../$(XHS_AGENT_OUTPUT)
	@echo ">>> xhs-agent build complete."

# Clean up sidecar build artifacts
clean-sidecar:
	@echo ">>> Cleaning sidecar artifacts..."
	rm -rf framework/sidecar/node_modules framework/sidecar/dist
	rm -rf xhs_agent/node_modules xhs_agent/dist
	rm -f $(BINARIES_DIR)/sidecar-* $(BINARIES_DIR)/xhs-agent-*
	@echo ">>> Sidecar clean complete."
