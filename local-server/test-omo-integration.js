#!/usr/bin/env node

/**
 * Oh-My-OpenCode Integration Test Script
 * 
 * Tests the oh-my-opencode plugin integration with local-server
 */

const BASE_URL = 'http://127.0.0.1:4096';

async function testOhMyOpenCode() {
  console.log('🧪 Testing Oh-My-OpenCode Integration...\n');

  // Test 1: Check server health
  console.log('1. Server Health Check');
  try {
    const healthRes = await fetch(`${BASE_URL}/global/health`);
    const health = await healthRes.json();
    console.log(`   ✅ Server is healthy`);
    console.log(`   📦 Version: ${health.version}`);
  } catch (error) {
    console.log(`   ❌ Server health check failed: ${error.message}`);
    return;
  }

  // Test 2: List available agents
  console.log('\n2. Checking Available Agents');
  try {
    const agentsRes = await fetch(`${BASE_URL}/agent`);
    const agents = await agentsRes.json();
    console.log(`   ✅ Found ${agents.length} agent(s)`);
    
    const agentNames = agents.map(a => a.name || a.id).join(', ');
    console.log(`   🤖 Agents: ${agentNames}`);
    
    // Check for oh-my-opencode specific agents
    const omoAgents = ['sisyphus', 'oracle', 'librarian', 'explore', 'frontend-ui-ux-engineer', 'cowork'];
    const foundOmoAgents = omoAgents.filter(name => 
      agents.some(a => (a.name || a.id).toLowerCase().includes(name.toLowerCase()))
    );
    
    if (foundOmoAgents.length > 0) {
      console.log(`   ✨ Oh-My-OpenCode agents found: ${foundOmoAgents.join(', ')}`);
    } else {
      console.log(`   ℹ️  Oh-My-OpenCode agents will be available after authentication`);
    }
  } catch (error) {
    console.log(`   ⚠️  Failed to fetch agents: ${error.message}`);
  }

  // Test 2b: Check for /cowork command
  console.log('\n2b. Checking /cowork Command');
  try {
    const commandRes = await fetch(`${BASE_URL}/command`);
    const commands = await commandRes.json();
    const hasCowork = commands.some(c => 
      (c.name || c.id || '').toLowerCase().includes('cowork')
    );
    if (hasCowork) {
      console.log(`   ✅ /cowork command is available`);
    } else {
      console.log(`   ℹ️  /cowork command not found (may require server restart)`);
    }
  } catch (error) {
    console.log(`   ⚠️  Failed to fetch commands: ${error.message}`);
  }

  // Test 3: Check provider configuration
  console.log('\n3. Provider Configuration');
  try {
    const providerRes = await fetch(`${BASE_URL}/provider`);
    const providerData = await providerRes.json();
    console.log(`   ✅ Provider info retrieved`);
    console.log(`   📋 Available providers: ${providerData.all?.length || 0}`);
    console.log(`   🔗 Connected providers: ${providerData.connected?.length || 0}`);
    
    if (providerData.connected?.length > 0) {
      console.log(`   ✅ Already connected to ${providerData.connected.length} provider(s)`);
    } else {
      console.log(`   💡 Run 'opencode auth login' to authenticate providers`);
    }
  } catch (error) {
    console.log(`   ⚠️  Failed to fetch providers: ${error.message}`);
  }

  // Test 4: Check MCP servers
  console.log('\n4. MCP Server Status');
  try {
    const mcpRes = await fetch(`${BASE_URL}/mcp`);
    const mcpData = await mcpRes.json();
    const mcpCount = Object.keys(mcpData).length;
    console.log(`   ✅ MCP info retrieved`);
    console.log(`   🔧 MCP servers: ${mcpCount}`);
    
    if (mcpCount > 0) {
      Object.keys(mcpData).forEach(name => {
        console.log(`      - ${name}`);
      });
    }
  } catch (error) {
    console.log(`   ⚠️  Failed to fetch MCP servers: ${error.message}`);
  }

  // Test 5: Check LSP servers
  console.log('\n5. LSP Server Status');
  try {
    const lspRes = await fetch(`${BASE_URL}/lsp`);
    const lspData = await lspRes.json();
    console.log(`   ✅ LSP info retrieved`);
    console.log(`   📝 LSP servers: ${lspData.length || 0}`);
  } catch (error) {
    console.log(`   ⚠️  Failed to fetch LSP servers: ${error.message}`);
  }

  console.log('\n📚 Oh-My-OpenCode Features:');
  console.log('   • Sisyphus: Main orchestrator agent (Claude Opus 4.5)');
  console.log('   • Oracle: Architecture & code review (GPT-5.2)');
  console.log('   • Librarian: Documentation & research (GLM-4.7)');
  console.log('   • Explore: Fast codebase exploration (Grok Code)');
  console.log('   • Cowork: Autonomous task completion (Claude Opus 4.5)');
  console.log('   • Frontend Engineer: UI/UX specialist (Gemini 3 Pro)');
  console.log('   • Background tasks & parallel execution');
  console.log('   • LSP & AST-grep tools');
  console.log('   • Built-in MCP servers (Exa, Context7, GrepApp)');
  console.log('   • /cowork command for autonomous file operations');

  console.log('\n🎯 Next Steps:');
  console.log('   1. Authenticate with providers: opencode auth login');
  console.log('   2. Use @agent-name to call specific agents');
  console.log('   3. Use "ultrawork" or "ulw" for parallel execution');
  console.log('   4. Use /cowork for autonomous task completion');
  console.log('   5. View API docs: http://127.0.0.1:4096/doc');

  console.log('\n✅ Oh-My-OpenCode integration test complete!');
}

// Run tests
testOhMyOpenCode().catch(console.error);
