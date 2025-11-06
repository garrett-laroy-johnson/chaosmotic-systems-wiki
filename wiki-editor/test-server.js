const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Very basic test endpoint
app.get('/', (req, res) => {
  res.send(`
    <h1>Railway Test - Working!</h1>
    <p>Current time: ${new Date().toISOString()}</p>
    <p>Environment: ${process.env.NODE_ENV || 'development'}</p>
    <p>Port: ${PORT}</p>
  `);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Test server running on port ${PORT}`);
});