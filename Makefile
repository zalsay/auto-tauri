.PHONY: build-sidecar clean-sidecar help

# ============================================================
# Platform Configuration
# Usage: make build-sidecar PLATFORM=<platform>
# Platforms: auto, macos-arm64, macos-x64, linux-x64, windows-x64
# ============================================================

PLATFORM ?= auto

# Platform-specific configurations
ifeq ($(PLATFORM), macos-arm64)
    PKG_TARGET := node18-macos-arm64
    SIDECAR_NAME := sidecar-aarch64-apple-darwin
    XHS_AGENT_NAME := xhs-agent-aarch64-apple-darwin
else ifeq ($(PLATFORM), macos-x64)
    PKG_TARGET := node18-macos-x64
    SIDECAR_NAME := sidecar-x86_64-apple-darwin
    XHS_AGENT_NAME := xhs-agent-x86_64-apple-darwin
else ifeq ($(PLATFORM), linux-x64)
    PKG_TARGET := node18-linux-x64
    SIDECAR_NAME := sidecar-x86_64-unknown-linux-gnu
    XHS_AGENT_NAME := xhs-agent-x86_64-unknown-linux-gnu
else ifeq ($(PLATFORM), windows-x64)
    PKG_TARGET := node18-win-x64
    SIDECAR_NAME := sidecar-x86_64-pc-windows-msvc.exe
    XHS_AGENT_NAME := xhs-agent-x86_64-pc-windows-msvc.exe
else
    # Auto-detect from current system
    OS := $(shell uname -s)
    ARCH := $(shell uname -m)
    
    # Default to Linux x64
    PKG_TARGET := node18-linux-x64
    SIDECAR_NAME := sidecar-x86_64-unknown-linux-gnu
    XHS_AGENT_NAME := xhs-agent-x86_64-unknown-linux-gnu
    
    ifeq ($(OS), Darwin)
        ifeq ($(ARCH), arm64)
            PKG_TARGET := node18-macos-arm64
            SIDECAR_NAME := sidecar-aarch64-apple-darwin
            XHS_AGENT_NAME := xhs-agent-aarch64-apple-darwin
        else
            PKG_TARGET := node18-macos-x64
            SIDECAR_NAME := sidecar-x86_64-apple-darwin
            XHS_AGENT_NAME := xhs-agent-x86_64-apple-darwin
        endif
    endif
    
    ifneq (,$(findstring MINGW,$(OS)))
        PKG_TARGET := node18-win-x64
        SIDECAR_NAME := sidecar-x86_64-pc-windows-msvc.exe
        XHS_AGENT_NAME := xhs-agent-x86_64-pc-windows-msvc.exe
    endif
endif

# Output paths
BINARIES_DIR := framework/src-tauri/binaries
SIDECAR_OUTPUT := $(BINARIES_DIR)/$(SIDECAR_NAME)
XHS_AGENT_OUTPUT := $(BINARIES_DIR)/$(XHS_AGENT_NAME)

# ============================================================
# Targets
# ============================================================

help:
	@echo "Usage: make <target> [PLATFORM=<platform>]"
	@echo ""
	@echo "Targets:"
	@echo "  build-sidecar    Build all sidecar binaries"
	@echo "  build-hyperagent Build hyperagent sidecar only"
	@echo "  build-xhs-agent  Build xhs-agent sidecar only"
	@echo "  clean-sidecar    Clean all build artifacts"
	@echo ""
	@echo "Platforms:"
	@echo "  auto         Auto-detect from current system (default)"
	@echo "  macos-arm64  Apple Silicon Mac"
	@echo "  macos-x64    Intel Mac"
	@echo "  linux-x64    Linux x64"
	@echo "  windows-x64  Windows x64"
	@echo ""
	@echo "Examples:"
	@echo "  make build-sidecar                    # Build for current platform"
	@echo "  make build-sidecar PLATFORM=macos-arm64"
	@echo "  make build-sidecar PLATFORM=linux-x64"

# Build all sidecars
build-sidecar: build-hyperagent build-xhs-agent
	@echo ">>> All sidecars built for $(PLATFORM) ($(PKG_TARGET))"

build-hyperagent:
	@echo ">>> Building sidecar (hyperagent) for $(PKG_TARGET)..."
	cd framework/sidecar && npm install && npm run build
	@echo ">>> Packaging sidecar..."
	cd framework/sidecar && npx pkg dist/bundle/index.js --targets $(PKG_TARGET) --output ../src-tauri/binaries/$(SIDECAR_NAME)
	@echo ">>> sidecar -> $(SIDECAR_OUTPUT)"

build-xhs-agent:
	@echo ">>> Building xhs-agent for $(PKG_TARGET)..."
	cd xhs_agent && npm install && npx tsc
	@echo ">>> Packaging xhs-agent..."
	cd xhs_agent && npx pkg dist/index.js --targets $(PKG_TARGET) --output ../$(XHS_AGENT_OUTPUT)
	@echo ">>> xhs-agent -> $(XHS_AGENT_OUTPUT)"

# Clean up build artifacts
clean-sidecar:
	@echo ">>> Cleaning sidecar artifacts..."
	rm -rf framework/sidecar/node_modules framework/sidecar/dist
	rm -rf xhs_agent/node_modules xhs_agent/dist
	rm -f $(BINARIES_DIR)/sidecar-* $(BINARIES_DIR)/xhs-agent-*
	@echo ">>> Clean complete."
