
// Script to delete a user's conversation record from MongoDB by phone number
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/smartagent';


const phoneNumber = process.argv[2];
if (!phoneNumber) {
  console.error('Usage: node delete_user_conversation.js <phoneNumber>');
  process.exit(1);
}


async function deleteConversation() {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db();
    const result = await db.collection('conversations').deleteMany({ phoneNumber });
    console.log('Deleted records:', result.deletedCount);
  } catch (err) {
    console.error('Error deleting conversation:', err);
  } finally {
    await client.close();
  }
}

deleteConversation();
