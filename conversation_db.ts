
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/smartagent';
const client = new MongoClient(MONGODB_URI);
let db: any;

async function getDb() {
  if (!db) {
    await client.connect();
    db = client.db();
  }
  return db;
}



export type ConversationState = 'Started' | 'Ended';

export interface ConversationRecord {
  phoneNumber: string;
  firstName: string;
  lastName: string;
  fullConversation: string;
  lastMessage: string;
  lastReply: string;
  timestamp: string;
  conversationState: ConversationState;
  conversationEndTimeStamp?: string;
}



export async function saveConversation(record: ConversationRecord) {
  try {
    const database = await getDb();
    await database.collection('conversations').updateOne(
      { phoneNumber: record.phoneNumber },
      { $set: record },
      { upsert: true }
    );
    console.log(`[MongoDB] Saved conversation for ${record.phoneNumber}`);
  } catch (err) {
    console.error('[MongoDB] Failed to save conversation:', err);
  }
}

export async function getConversationByState(phoneNumber: string, state: ConversationState) {
  try {
    const database = await getDb();
    return await database.collection('conversations').findOne({ phoneNumber, conversationState: state });
  } catch (err) {
    console.error('[MongoDB] Failed to get conversation by state:', err);
    return null;
  }
}
