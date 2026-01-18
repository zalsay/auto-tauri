#!/usr/bin/env node

/**
 * OpenCode Local Server Test Client
 * 
 * This script demonstrates how to interact with OpenCode server via REST API
 */

const BASE_URL = 'http://127.0.0.1:4096';

async function testServer() {
  console.log('🧪 Testing OpenCode Local Server...\n');

  // Test 1: Health Check
  console.log('1. Testing health check...');
  try {
    const healthRes = await fetch(`${BASE_URL}/global/health`);
    const health = await healthRes.json();
    console.log(`   ✅ Server is healthy`);
    console.log(`   📦 Version: ${health.version}`);
  } catch (error) {
    console.log(`   ❌ Health check failed: ${error.message}`);
    return;
  }

  // Test 2: Get Projects
  console.log('\n2. Fetching projects...');
  try {
    const projectsRes = await fetch(`${BASE_URL}/project`);
    const projects = await projectsRes.json();
    console.log(`   ✅ Found ${projects.length} project(s)`);
    projects.forEach(p => console.log(`   📁 ${p.worktree}`));
  } catch (error) {
    console.log(`   ❌ Failed to fetch projects: ${error.message}`);
  }

  // Test 3: Get Providers
  console.log('\n3. Fetching providers...');
  try {
    const providersRes = await fetch(`${BASE_URL}/provider`);
    const providers = await providersRes.json();
    console.log(`   ✅ Connected providers: ${providers.connected?.length || 0}`);
    console.log(`   📋 Available providers: ${providers.all?.length || 0}`);
  } catch (error) {
    console.log(`   ❌ Failed to fetch providers: ${error.message}`);
  }

  // Test 4: List Sessions
  console.log('\n4. Fetching sessions...');
  try {
    const sessionsRes = await fetch(`${BASE_URL}/session`);
    const sessions = await sessionsRes.json();
    console.log(`   ✅ Found ${sessions.length} session(s)`);
  } catch (error) {
    console.log(`   ❌ Failed to fetch sessions: ${error.message}`);
  }

  console.log('\n🎉 All tests completed!');
  console.log(`\n📚 API Documentation: ${BASE_URL}/doc`);
  console.log(`🌐 OpenCode Web: ${BASE_URL.replace('4096', '3000')}`);
}

// Run tests
testServer().catch(console.error);
