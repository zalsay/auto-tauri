-- Database Initialization Script for Auto-Tauri

-- Usage:
-- 1. Connect to your PostgreSQL server (default database 'postgres'):
--    psql -h 8.163.5.7 -p 50432 -U user_THtJYy -d postgres
-- 2. Run the CREATE DATABASE command.
-- 3. Connect to the new database and run the table creation scripts.

-- Step 1: Create Database
-- Note: Check if you have permission to create databases.
CREATE DATABASE auto_tauri;

-- Step 2: Connect to the database (if running in psql CLI)
-- \c auto_tauri

-- Step 3: Create Tables

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    balance BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Transactions Table
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    amount BIGINT NOT NULL,
    type VARCHAR(32) NOT NULL,
    description VARCHAR(512),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_users_transactions FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Tasks Table
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    prompt TEXT NOT NULL,
    status VARCHAR(32) NOT NULL,
    cost BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_users_tasks FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
