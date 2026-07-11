require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set.');
  console.error('Set it in Render -> your Web Service -> Environment tab before deploying.');
  console.error('Refusing to start with a guessable default secret - that would let anyone forge an admin session.');
  process.exit(1);
}

module.exports = { JWT_SECRET };
