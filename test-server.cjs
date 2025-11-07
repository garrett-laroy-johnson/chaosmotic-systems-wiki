const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

console.log('=== SERVER STARTUP DEBUG ===');
console.log('Starting server with the following configuration:');
console.log('PORT:', PORT);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('All environment variables:', Object.keys(process.env).filter(key => key.includes('PORT') || key.includes('RAILWAY')));

// Log all incoming requests
app.use((req, res, next) => {
  console.log(`=== INCOMING REQUEST ===`);
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Remote IP:', req.ip || req.connection.remoteAddress);
  next();
});

// Add response logging
app.use((req, res, next) => {
  const originalSend = res.send;
  res.send = function(data) {
    console.log(`=== SENDING RESPONSE ===`);
    console.log(`Status: ${res.statusCode}`);
    console.log(`Response length: ${data ? data.length : 0} bytes`);
    return originalSend.call(this, data);
  };
  next();
});

// Very basic test endpoint
app.get('/', (req, res) => {
  console.log('=== ROOT ENDPOINT HIT ===');
  res.status(200).send(`
    <h1>Railway Test - Working!</h1>
    <p>Current time: ${new Date().toISOString()}</p>
    <p>Environment: ${process.env.NODE_ENV || 'development'}</p>
    <p>Port: ${PORT}</p>
    <p>Host header: ${req.get('host')}</p>
    <p>User agent: ${req.get('user-agent')}</p>
    <p>Remote IP: ${req.ip || req.connection.remoteAddress}</p>
  `);
});

app.get('/health', (req, res) => {
  console.log('=== HEALTH CHECK HIT ===');
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(), 
    port: PORT,
    uptime: process.uptime()
  });
});

// Catch all other routes
app.use('*', (req, res) => {
  console.log(`=== CATCH-ALL HIT: ${req.method} ${req.originalUrl} ===`);
  res.status(404).send(`
    <h1>404 - Not Found</h1>
    <p>Path: ${req.originalUrl}</p>
    <p>Method: ${req.method}</p>
    <p>Available endpoints: / and /health</p>
  `);
});

// Error handling
app.use((error, req, res, next) => {
  console.log('=== ERROR OCCURRED ===');
  console.error('Server error:', error);
  res.status(500).send('Internal Server Error');
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('=== SERVER STARTED ===');
  console.log(`Test server running on port ${PORT}`);
  console.log(`Server should be accessible at http://0.0.0.0:${PORT}`);
  console.log(`Process PID: ${process.pid}`);
  console.log(`Node version: ${process.version}`);
});

// Handle server errors
server.on('error', (error) => {
  console.log('=== SERVER ERROR ===');
  console.error('Server failed to start:', error);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('=== SIGTERM RECEIVED ===');
  server.close(() => {
    console.log('Server closed');
  });
});

console.log('=== SERVER SETUP COMPLETE ===');