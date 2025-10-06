require('dotenv').config();

console.log('Testing MongoDB Connection...');
console.log('Connection String (masked):', 
  process.env.MONGODB_URI.replace(/\/\/.*:.*@/, '//*****:*****@')
);

const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ SUCCESS! MongoDB connected');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ FAILED:', err.message);
    console.error('Full error:', err);
    process.exit(1);
  });