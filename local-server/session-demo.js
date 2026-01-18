#!/usr/bin/env node

/**
 * OpenCode Session Management Example
 * 
 * Demonstrates how to create sessions and send messages
 */

const BASE_URL = 'http://127.0.0.1:4096';

async function createSessionAndMessage() {
  console.log('🚀 OpenCode Session Demo\n');

  // Step 1: Create a new session
  console.log('1. Creating a new session...');
  const sessionRes = await fetch(`${BASE_URL}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'API Test Session' })
  });
  
  if (!sessionRes.ok) {
    console.log(`   ❌ Failed to create session: ${sessionRes.status}`);
    return;
  }
  
  const session = await sessionRes.json();
  console.log(`   ✅ Session created: ${session.id}`);
  console.log(`   📝 Title: ${session.title}`);

  // Step 2: Send a test message
  console.log('\n2. Sending a test message...');
  const messageRes = await fetch(`${BASE_URL}/session/${session.id}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      parts: [{ type: 'text', text: 'Hello! This is a test message from the local server.' }]
    })
  });

  if (!messageRes.ok) {
    console.log(`   ❌ Failed to send message: ${messageRes.status}`);
    const errorText = await messageRes.text();
    console.log(`   Error: ${errorText}`);
    return;
  }

  const response = await messageRes.json();
  console.log(`   ✅ Message sent successfully`);
  console.log(`   💬 Response type: ${response.info.role}`);
  console.log(`   📄 Parts count: ${response.parts.length}`);

  // Step 3: List sessions again
  console.log('\n3. Verifying session was created...');
  const sessionsRes = await fetch(`${BASE_URL}/session`);
  const sessions = await sessionsRes.json();
  console.log(`   ✅ Total sessions: ${sessions.length}`);

  console.log('\n🎯 Demo completed!');
  console.log(`\n💡 To view all available APIs, visit: ${BASE_URL}/doc`);
}

createSessionAndMessage().catch(console.error);
