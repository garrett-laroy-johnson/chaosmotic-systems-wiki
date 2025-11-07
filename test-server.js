const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

console.log('Starting server with the following configuration:');
console.log('PORT:', PORT);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('All environment variables:', Object.keys(process.env).filter(key => key.includes('PORT') || key.includes('RAILWAY')));

// Very basic test endpoint
app.get('/', (req, res) => {
  console.log('Received request to /', req.headers);
  res.send(`
    <h1>Railway Test - Working!</h1>
    <p>Current time: ${new Date().toISOString()}</p>
    <p>Environment: ${process.env.NODE_ENV || 'development'}</p>
    <p>Port: ${PORT}</p>
    <p>Host header: ${req.get('host')}</p>
    <p>User agent: ${req.get('user-agent')}</p>
  `);
});

app.get('/health', (req, res) => {
  console.log('Health check requested');
  res.json({ status: 'ok', timestamp: new Date().toISOString(), port: PORT });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Test server running on port ${PORT}`);
  console.log(`Server should be accessible at http://0.0.0.0:${PORT}`);
});