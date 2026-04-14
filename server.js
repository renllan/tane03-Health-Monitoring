require('dotenv').config();
require('ts-node/register');
const app = require('./app').default;

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Development server is running at http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
});
