const express = require('express');
const app = express();
const PORT = process.env.PORT || 3001; // Changed default to match Railway

console.log('=== SERVER STARTUP DEBUG ===');
console.log('Starting server with the following configuration:');
console.log('PORT from environment:', process.env.PORT);
console.log('PORT being used:', PORT);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('RAILWAY_PUBLIC_DOMAIN:', process.env.RAILWAY_PUBLIC_DOMAIN);
console.log('RAILWAY_PRIVATE_DOMAIN:', process.env.RAILWAY_PRIVATE_DOMAIN);
console.log('All environment variables:', Object.keys(process.env).filter(key => key.includes('PORT') || key.includes('RAILWAY')));

// Railway specific middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Trust Railway's proxy
app.set('trust proxy', true);

// Log all incoming requests
app.use((req, res, next) => {
  console.log(`=== INCOMING REQUEST ===`);
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Remote IP:', req.ip || req.connection.remoteAddress);
  console.log('X-Forwarded-For:', req.get('X-Forwarded-For'));
  console.log('X-Real-IP:', req.get('X-Real-IP'));
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

// Railway health check endpoint (Railway might check this automatically)
app.get('/healthz', (req, res) => {
  console.log('=== RAILWAY HEALTH CHECK HIT ===');
  res.status(200).json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'chaosmotic-wiki-editor'
  });
});

// Standard health check
app.get('/health', (req, res) => {
  console.log('=== HEALTH CHECK HIT ===');
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(), 
    port: PORT,
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
  });
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
    <p>Railway Public Domain: ${process.env.RAILWAY_PUBLIC_DOMAIN || 'not set'}</p>
    <p>Railway Private Domain: ${process.env.RAILWAY_PRIVATE_DOMAIN || 'not set'}</p>
  `);
});

// Catch all other routes
app.use('*', (req, res) => {
  console.log(`=== CATCH-ALL HIT: ${req.method} ${req.originalUrl} ===`);
  res.status(404).send(`
    <h1>404 - Not Found</h1>
    <p>Path: ${req.originalUrl}</p>
    <p>Method: ${req.method}</p>
    <p>Available endpoints: /, /health, /healthz</p>
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
  
  // Send a test request to ourselves to verify the server is responding
  setTimeout(() => {
    console.log('=== SELF TEST ===');
    const http = require('http');
    const options = {
      hostname: '127.0.0.1',
      port: PORT,
      path: '/health',
      method: 'GET'
    };
    
    const req = http.request(options, (res) => {
      console.log(`Self-test response status: ${res.statusCode}`);
      res.on('data', (chunk) => {
        console.log(`Self-test response: ${chunk}`);
      });
    });
    
    req.on('error', (e) => {
      console.log(`Self-test error: ${e.message}`);
    });
    
    req.end();
  }, 2000);
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