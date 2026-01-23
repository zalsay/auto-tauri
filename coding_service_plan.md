# Unified AI Coding Service Integration Plan

**Version:** 2.0 (Consolidated)
**Date:** 2026-01-23
**Objective:** Transform the Tauri Task Manager into a "Mission Control" center that orchestrates external AI agents. The system will manage **Ralph** (for complex, architectural tasks) and **OpenCode** (for rapid, parallel, lightweight tasks) within a unified interface.

---

## 1. System Architecture (系统架构)

The system relies on a **"Bring Your Own Environment" (BYOE)** strategy. Tauri acts as a secure shell that injects the necessary system paths to execute user-installed CLI tools on the host OS.

### Data Flow Diagram

```mermaid
graph TD
    User[User UI / Task Board] -->|Dispatch| RustBackend
    
    subgraph "Rust Backend (The Bridge)"
        Env[Environment Fixer] --> Runner[Process Spawner]
        Queue[Task Queue] --> Runner
        Monitor[Log Watcher]
    end
    
    Runner -->|Serial Execution| Ralph[Ralph Agent]
    Runner -->|Parallel Execution| OpenCode[OpenCode Agent]
    
    subgraph "External File System"
        Repo[.ralph/ Config & Logs]
        Src[Source Code]
    end
    
    Ralph -->|Writes Plan| Repo
    Ralph -->|Edits Code| Src
    OpenCode -->|Edits Code| Src
    
    Monitor <..|Reads Status|.. Repo

```

---

## Phase 1: The Foundation (Infrastructure & Environment)

*Goal: Ensure Tauri can find and execute `git`, `node`, `ralph`, and `opencode` reliably on any OS.*

### 1.1 Environment Bridge (`src-tauri/src/infra/env.rs`)

* [ ] **Implement `fix_path_env() -> String`:**
* **Logic:** Detect OS (Windows/Mac/Linux) and reconstruct `PATH`.
* **Mac/Linux:** Force append common missing paths:
* `/usr/local/bin`
* `/opt/homebrew/bin` (Apple Silicon)
* `$HOME/.nvm/versions/node/...` (Dynamic detection if possible)
* `$HOME/.cargo/bin`


* **Critical:** This function must be injected into the environment of *every* child process spawned.



### 1.2 System Doctor (`src-tauri/src/infra/doctor.rs`)

* [ ] **Implement `check_system_health()` Command:**
* **Action:** Run `which` (Unix) or `where` (Windows) using the fixed PATH.
* **Targets:** `git`, `node`, `ralph`, `opencode`.
* **Output:** JSON status object (e.g., `{ ralph_installed: false, opencode_ready: true }`).


* [ ] **Implement `install_tool_in_terminal(tool_name)`:**
* **Action:** Spawn the OS native terminal to run installation scripts (avoids permission issues inside Tauri).
* **Scripts:**
* Ralph: `git clone ... && ./install.sh`
* OpenCode: `curl ... | bash`





### 1.3 Unified Process Runner (`src-tauri/src/infra/runner.rs`)

* [ ] **Create `spawn_agent_process()` utility:**
* A generic wrapper for `std::process::Command`.
* **Configuration:**
* `.env("PATH", fix_path_env())`
* `.current_dir(target_project_path)` (Crucial for context)
* `.env("FORCE_COLOR", "1")` (For ANSI log parsing in UI)
* `.env("CI", "true")` (To prevent interactive prompts)





---

## Phase 2: Ralph Integration (The Architect)

*Goal: Manage long-running, complex architectural coding sessions.*

### 2.1 The Dispatcher (Rust)

* [ ] **Implement `sync_ralph_plan(project_path, tasks)`:**
* **Input:** List of task strings.
* **Logic:**
1. Check if `<project_path>/.ralph/` exists.
2. Format tasks into Markdown Checkboxes (`- [ ] Task Name`).
3. Write to `<project_path>/.ralph/@fix_plan.md`.


* **Mode:** Overwrite active plan (recommended) or Append.



### 2.2 The Monitor (Rust)

* [ ] **Implement `get_ralph_progress(project_path)`:**
* **Usage:** Polled by Frontend (e.g., every 2s).
* **Logic:**
1. **Plan Parsing:** Read `.ralph/@fix_plan.md`. Count `[x]` vs `[ ]` lines to calculate percentage.
2. **Log Tailing:** Read the last 500 bytes of `.ralph/logs/ralph.log`. Extract the last non-empty line as `current_activity`.
3. **Status:** Return JSON `{ total, completed, percent, last_log, is_active }`.





### 2.3 The Launchpad

* [ ] **Implement `open_terminal_at(path)`:**
* Function to open system terminal at `project_path` so user can run `ralph --monitor` manually if needed.



---

## Phase 3: OpenCode Integration (The Intern)

*Goal: Manage rapid, parallel, lightweight tasks (Refactors, Comments, Fixes).*

### 3.1 The Worker Pool (Rust)

* [ ] **Create `OpenCodeRunner` Struct:**
* Manage a queue of short-lived tasks.
* **Concurrency:** Use `tokio::sync::Semaphore` to limit max concurrent CLI instances (e.g., 3 workers).



### 3.2 Task Execution with Isolation

* [ ] **Implement `spawn_opencode_task(file_path, prompt)`:**
* **Isolation Level 1 (File Lock):**
* Maintain a global `Arc<Mutex<HashSet<String>>>` (Locked Files).
* Reject task if `file_path` is currently locked.


* **Command Execution:**
```bash
opencode --prompt "Context: {file_path}. Task: {prompt}. ONLY modify this file." --non-interactive --auto-apply

```


* **Streaming:** Capture `stdout` line-by-line and emit Tauri Events (`opencode://log`) to update the UI card.

### 3.5 The AI Router (Smart Dispatcher) [NEW]

#### 3.5.1 The Classifier Logic (`src-tauri/src/ai/router.rs`)

* [ ] Define `TaskComplexity` Enum:
    ```rust
    enum AgentType {
        Ralph,    // For complex, multi-file, or architectural tasks
        OpenCode, // For simple, single-file, or specific fixes
    }
    ```

* [ ] Implement `classify_task(prompt: String) -> AgentType`:
    * **Mechanism**: Spawn a lightweight OpenCode process just to analyze the text (not code).
    * **System Prompt**:
        > "You are a Technical Lead. Analyze the following coding task. If it requires creating new files, modifying architecture, or planning across multiple files, respond with 'RALPH'. If it is a simple fix, typo, comment, or single-function refactor, respond with 'OPENCODE'. Respond ONLY with the word 'RALPH' or 'OPENCODE'."
    * **Command**:
        ```bash
        opencode --prompt "System: [PROMPT_ABOVE]. User Task: {user_prompt}" --non-interactive
        ```
    * **Parsing**: Read stdout. If it contains "RALPH" -> Route to Phase 2. If "OPENCODE" -> Route to Phase 3.

#### 3.5.2 The Router Command (`src-tauri/src/commands/dispatch.rs`)

* [ ] Implement `smart_dispatch_task(project_path, task_desc)`:
    1. **Step 1**: Call `classify_task(task_desc)`.
    2. **Step 2**:
        * If **Ralph**: Append task to `.ralph/@fix_plan.md` using `sync_ralph_plan`. Notify user: "Task is complex. Added to Ralph's Plan."
        * If **OpenCode**: Directly spawn `spawn_opencode_task`. Notify user: "Quick fix detected. OpenCode is working on it..."

### 3.6 PRD Analysis & Task Generation [NEW]

#### 3.6.1 The PRD Reader (`src-tauri/src/ai/parser.rs`)

* [ ] Implement `extract_tasks_from_prd(file_path)`:
    1. **Step 1**: File Reading:
        * Support `.md`, `.txt`.
        * (Optional) Use `pdf-extract` create if supporting PDF.
    2. **Step 2**: AI Processing (OpenCode):
        * **Prompt Strategy**:
            > "You are a Senior Project Manager. Read the following PRD content. Break it down into atomic, actionable technical tasks. Return ONLY a raw JSON array of strings. No markdown formatting. Example: [\"Create database schema for Users\", \"Implement login API endpoint\"]"
        * **Command**:
            ```bash
            opencode --prompt "Context: [FILE_CONTENT]. Instruction: [PROMPT]" --non-interactive
            ```
    3. **Step 3**: Cleaning:
        * Parse the stdout. If OpenCode wraps it in ` ```json ... ``` `, strip the tags to get raw JSON.
        * Deserialize into `Vec<String>`.

#### 3.6.2 Integration with Ralph Import (Optional alternative)

* [ ] Implement `run_ralph_import_cli(file_path)`:
    * If the user wants to initialize a fresh project from PRD, invoke the native Ralph command:
        ```bash
        ralph-import <file_path> <project_name>
        ```
    * This is useful for "New Project" flows, while the OpenCode parser is better for "Adding features to existing project".


### 3.7 Specification & Planning [NEW]

Goal: Use OpenCode to generate detailed implementation and testing strategies based on the skill-creator methodology.

#### 3.7.1 The Architect (Generates develop_plan.md)

* [ ] **Implement `generate_dev_plan(task_description, project_context)`:**
    * **Role:** System Architect.
    * **Prompt Strategy (Reference SKILL.md):**
        > "You are a Senior Software Architect. Analyze the User Requirement. Generate a develop_plan.md following this structure:
        >
        > Goal: One sentence summary.
        >
        > Architecture: Which files need creation/modification? Data structures?
        >
        > Step-by-Step Implementation: Atomic coding steps.
        >
        > Edge Cases: What could go wrong? Output ONLY the Markdown content."
    * **Action:** Save to `<project_path>/.ralph/specs/develop_plan.md`.

#### 3.7.2 The QA Lead (Generates testing_plan.md)

* [ ] **Implement `generate_test_plan(dev_plan_content)`:**
    * **Role:** QA Engineer.
    * **Input:** The content of the just-generated `develop_plan.md`.
    * **Prompt Strategy:**
        > "You are a QA Lead. Based on the Development Plan provided: Generate a testing_plan.md following this structure:
        >
        > Unit Tests: Which functions need tests? (Mock data needed?)
        >
        > Integration Tests: How to verify modules work together?
        >
        > Manual Verification: Command line checks to run (e.g., curl commands, CLI flags).
        >
        > Success Criteria: Checklist for completion. Output ONLY the Markdown content."
    * **Action:** Save to `<project_path>/.ralph/specs/testing_plan.md`.


## Phase 4: Frontend Implementation (UI/UX)

### 4.1 Project Settings

* [ ] **"Link Repository" Panel:**
* Input field for `local_repo_path`.
* "Browse" button using `dialog.open`.
* **Status Indicators:** Show Green/Red dots for "Ralph Installed" & "OpenCode Ready" (via System Doctor).



### 4.2 The Dashboard (Mission Control)

* [ ] **Ralph Widget:**
* **Visual:** Large progress bar + Terminal-style log window.
* **Action:** "Sync Plan" button (triggers `sync_ralph_plan`).


* [ ] **OpenCode Widget (Worker Grid):**
* **Visual:** Grid of small cards representing active worker threads.
* **States:** `Idle` (Gray) -> `Working` (Spinning Green) -> `Done` (Checkmark).
* **Interaction:** Right-click context menu on a Task item -> "Quick Fix with OpenCode".



---

## Phase 5: Safety & Edge Cases

* [ ] **Conflict Prevention:**
* If Ralph is detected as active (check process or lock file), display a warning before starting OpenCode tasks (avoids Git index lock conflicts).


* [ ] **Log Rotation:**
* Ensure `get_ralph_progress` returns "Waiting for logs..." instead of crashing if `ralph.log` is empty/missing.


* [ ] **Output Sanitization:**
* Use a library (like `ansi_up` on Frontend) to render CLI colors in the Web UI, or strip ANSI codes in Rust before sending.



---

## Development Roadmap (Suggested Order)

1. **Infra:** Build `env.rs` & `doctor.rs`. (Nothing works without this).
2. **Ralph Backend:** Implement Plan syncing and Log reading.
3. **UI Basic:** Build Project Linker & Ralph Status Bar.
4. **OpenCode:** Implement the CLI runner & "Quick Fix" button.
5. **Polish:** Add animations, concurrency limits, and conflict warnings.
