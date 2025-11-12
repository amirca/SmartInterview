import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import bodyParser from 'body-parser';
import axios, { AxiosError } from 'axios';
import { sendWhatsAppMessage, sendTemplateMessage, askYesNoQuestion } from './whatsapp.js';
import { findAWayToConvice, summarizeConversation } from './llm.js';
import { saveConversation, getConversationByState } from '../conversation_db.js';
// Track negative/convince attempts per user
const convinceAttemptsMap = new Map<string, number>();
import nodemailer from 'nodemailer';
import { use } from 'chai';

// Load agent prompt at startup (ESM compatible)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadTextFile(filePath: string, label: string = ''): string {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    if (label) {
      console.log(`Loaded ${label} from ${filePath}`);
    }
    return text;
  } catch (err) {
    if (label) {
      console.error(`Failed to load ${label} from ${filePath}:`, err);
    } else {
      console.error(`Failed to load file: ${filePath}`, err);
    }
    return '';
  }
}

const SYSTEM_CONTENT_PATH = path.resolve(process.cwd(), 'system_content.txt');
const USER_CONTENT_PATH = path.resolve(process.cwd(), 'user_content.txt');
const JOB_DESCRIPTION_PATH = path.resolve(process.cwd(), 'job_description.txt');
const INTERVIEW_QUESTIONS_PATH = path.resolve(process.cwd(), 'interview_questions.txt');
const SEE_VIDEO_QUESTION_PATH = path.resolve(process.cwd(), 'see_video_question.txt');
const END_OF_CONVERSATION_PATH = path.resolve(process.cwd(), 'end_of_conversation.txt');
const VIDEO_LINK_PATH = path.resolve(process.cwd(), 'video_link.txt');
const SCHEDULE_LINK_PATH = path.resolve(process.cwd(), 'schedule_link.txt');
const SCHEDULE_EMAIL_PATH = path.resolve(process.cwd(), 'schedule_email.txt');
const INTRO_QUESTION_PATH = path.resolve(process.cwd(), 'intro_question.txt');
const CONVERSATION_FAILED_RESPONSE_PATH = path.resolve(process.cwd(), 'conversation_failed_response.txt');
const SUMMARY_USER_CONTENT_PATH = path.resolve(process.cwd(), 'summary_user_content.txt');


const systemContent = loadTextFile(SYSTEM_CONTENT_PATH, 'system content');
const userContent = loadTextFile(USER_CONTENT_PATH, 'user content');
const seeVideoQuestion = loadTextFile(SEE_VIDEO_QUESTION_PATH, 'see video question');
const interviewQuestions = loadTextFile(INTERVIEW_QUESTIONS_PATH, 'interview questions').trim();
const jobDescription = loadTextFile(JOB_DESCRIPTION_PATH, 'job description').trim();
const videoLink = loadTextFile(VIDEO_LINK_PATH, 'video link').trim();
const endOfConversation = loadTextFile(END_OF_CONVERSATION_PATH, 'end of conversation').trim();
const scheduleLink = loadTextFile(SCHEDULE_LINK_PATH, 'schedule link').trim();
const scheduleEmail = loadTextFile(SCHEDULE_EMAIL_PATH, 'schedule email').trim();
const introQuestion = loadTextFile(INTRO_QUESTION_PATH, 'intro question').trim();
const conversationFailedResponse = loadTextFile(CONVERSATION_FAILED_RESPONSE_PATH, 'conversation failed response').trim();
const summaryUserContent = loadTextFile(SUMMARY_USER_CONTENT_PATH, 'summary user content').trim();


const CONVERSATION_FAILED = 'CONVERSATION_FAILED';
const INTRO_TEMPLATE_MESSAGE = 'intro_template_message';
const END_OF_CONVERSATION_MESSAGE = 'end_of_conversation_message';
const CUSTOM_CONVINCE_QUESTION_MESSAGE = 'custom_convince_question';
const END_OF_CONVERSATION = 'END_OF_CONVERSATION';
const SALES_INBOX_MAIL = "capuano@gmail.com";
let last_message = INTRO_TEMPLATE_MESSAGE;


// Set default last_message for new users
// Helper to handle END_OF_CONVERSATION logic
async function handleEndOfConversation({
  from,
  userInfo,
  userState,
  endOfConversation,
  scheduleLink, conversationText
}: {
  from: string;
  userInfo: { firstName?: string; lastName?: string };
  userState: { lastMessage: string; lastMessageText: string; conversation: Array<{ from: string; text: string }> };
  endOfConversation: string;
  scheduleLink: string;
  conversationText: string;
}) {
    // Summarize the conversation
    const fullConversation = userState.conversation.map((m: {from: string, text: string}) => `${m.from === 'user' ? 'User' : 'Agent'}: ${m.text}`).join('\n');
    let customSummaryUserContent = summaryUserContent.replace('{job_description}', jobDescription)
                                            .replace('{interview_questions}', interviewQuestions)
                                            .replace('{full_conversation}', fullConversation)
                                            .replace('{candidate_name}', userInfo.firstName || '');
    const conversation_summary = await summarizeConversation(customSummaryUserContent);
    //let customEndOfConversation = endOfConversation.replace('{schedule_link}', scheduleLink).replace('{conversation_summary}', conversation_summary);
    
    conversationText = conversationText.replace(END_OF_CONVERSATION, '')
    console.log(`[Conversation] User ${from} conversation: ${conversationText}.`);
    await sendWhatsAppMessage(from, conversationText);
    
    //await sendWhatsAppMessage(from, customEndOfConversation);
    userState.lastMessage = END_OF_CONVERSATION_MESSAGE;
    //userState.lastMessageText = customEndOfConversation;
    userState.lastMessageText = conversationText;
    userState.conversation.push({ from: 'agent', text: conversationText });
    await saveConversation({
        phoneNumber: from,
        firstName: userInfo.firstName || '',
        lastName: userInfo.lastName || '',
        fullConversation: fullConversation,
        lastMessage: userState.lastMessage,
        lastReply: conversationText,
        timestamp: new Date().toISOString(),
        conversationState: 'Ended',
        conversationEndTimeStamp: new Date().toISOString()
    });

    try {
        let subject = `סיכום ראיון עם ${userInfo.firstName || ''} ${userInfo.lastName || ''}`.trim();
        let conversationTranscript = userState.conversation.map((m: {from: string, text: string}) => `${m.from === 'user' ? 'User' : 'Agent'}: ${m.text}`).join('\n');
        
        // Create email body with both transcript and summary
        let emailBody = `תמליל הראיון:\n${conversationTranscript}\n\n---\n\nסיכום הראיון:\n${conversation_summary}`;
        
        const emailResult = await sendGmail(subject, emailBody);
        console.log(`[EMAIL] Sent after END_OF_CONVERSATION_MESSAGE to ${SALES_INBOX_MAIL}:`, { subject, emailBody, success: emailResult });
    } catch (err) {
        console.error('[EMAIL] Failed to send after END_OF_CONVERSATION_MESSAGE:', err);
    }
}

// Helper to handle conversation failed logic
async function handleConversationFailed({ from, userInfo, userState, conversationFailedResponse }: {
  from: string;
  userInfo: { firstName?: string; lastName?: string };
  userState: { lastMessage: string; lastMessageText: string; conversation: Array<{ from: string; text: string }> };
  conversationFailedResponse: string;
}) {
  console.log(`[Conversation] User ${from} conversation failed after intro.`);
  await sendWhatsAppMessage(from, conversationFailedResponse);
  userState.lastMessage = CONVERSATION_FAILED;
  userState.lastMessageText = conversationFailedResponse;
  userState.conversation.push({ from: 'agent', text: conversationFailedResponse });
  await saveConversation({
    phoneNumber: from,
    firstName: userInfo.firstName || '',
    lastName: userInfo.lastName || '',
    fullConversation: userState.conversation.map((m: { from: string; text: string }) => `${m.from === 'user' ? 'User' : 'Agent'}: ${m.text}`).join('\n'),
    lastMessage: userState.lastMessage,
    lastReply: userState.lastMessageText,
    timestamp: new Date().toISOString(),
    conversationState: 'Ended',
    conversationEndTimeStamp: new Date().toISOString()
  });
}

// Helper to handle conversation success logic
async function handleConversation({ from, userInfo, userState, conversationText }: {
    from: string;
    userInfo: { firstName?: string; lastName?: string };
    userState: { lastMessage: string; lastMessageText: string; conversation: Array<{ from: string; text: string }> };
    conversationText: string;
}) {
    console.log(`[Conversation] User ${from} conversation: ${conversationText}.`);
    await sendWhatsAppMessage(from, conversationText);
    userState.lastMessage = CUSTOM_CONVINCE_QUESTION_MESSAGE;
    userState.lastMessageText = conversationText;
    userState.conversation.push({ from: 'agent', text: conversationText });
    // Save updated state to DB
    await saveConversation({
        phoneNumber: from,
        firstName: userInfo.firstName || '',
        lastName: userInfo.lastName || '',
        fullConversation: userState.conversation.map((m: { from: string; text: string }) => `${m.from === 'user' ? 'User' : 'Agent'}: ${m.text}`).join('\n'),
        lastMessage: userState.lastMessage,
        lastReply: userState.lastMessageText,
        timestamp: new Date().toISOString(),
        conversationState: 'Started',
    });
}

async function handleCustomConversationState({ from, userInfo, userState, replyText }: {
    from: string;
    userInfo: { firstName?: string; lastName?: string };
    userState: { lastMessage: string; lastMessageText: string; conversation: Array<{ from: string; text: string }> };
    replyText: string;
}) {
    console.log(`[Conversation] Handle custom user ${from} replyText: ${replyText}.`);
    let customSystemContent = systemContent;
    let customUserContent = userContent;
    const fullConversation = userState.conversation.map((m: {from: string, text: string}) => `${m.from === 'user' ? 'User' : 'Agent'}: ${m.text}`).join('\n'); 
    customSystemContent = customSystemContent.replace('{job_description}', jobDescription)
                                            .replace('{interview_questions}', interviewQuestions)
                                            .replace('{full_conversation}', fullConversation)
                                            .replace('{last_question}', userState.lastMessageText)
                                            .replace('{candidate_name}', userInfo.firstName || '')
    customUserContent = customUserContent.replace('{candidate_name}', userInfo.firstName || '')
                                        .replace('{last_question}', userState.lastMessageText)
                                        .replace('{last_answer}', replyText);
    let convinceText = await findAWayToConvice(customSystemContent, customUserContent);
    if (convinceText.includes(END_OF_CONVERSATION)) {
        await handleEndOfConversation({ from, userInfo, userState, endOfConversation, scheduleLink, conversationText: convinceText });
    } else {
        await handleConversation({ from, userInfo, userState, conversationText: convinceText });
    }
}

async function handleIntroMessageState({ from, userInfo, userState, replyText, yesNoResult }: {
    from: string;
    userInfo: { firstName?: string; lastName?: string };
    userState: { lastMessage: string; lastMessageText: string; conversation: Array<{ from: string; text: string }> };
    replyText: string;
    yesNoResult: string;
}) {
    console.log(`[Conversation] Handle intro message user ${from} Yes/No result: ${yesNoResult}, replyText: ${replyText}.`);
    if (yesNoResult === 'yes') {
        let customSystemContent = systemContent;
        let customUserContent = userContent;
        const fullConversation = userState.conversation.map((m: {from: string, text: string}) => `${m.from === 'user' ? 'User' : 'Agent'}: ${m.text}`).join('\n');   
        customSystemContent = customSystemContent.replace('{job_description}', jobDescription)
                                            .replace('{interview_questions}', interviewQuestions)
                                            .replace('{full_conversation}', fullConversation)
                                            .replace('{last_question}', userState.lastMessageText)
                                            .replace('{candidate_name}', userInfo.firstName || '')
        customUserContent = customUserContent.replace('{candidate_name}', userInfo.firstName || '')
                                            .replace('{last_question}', userState.lastMessageText)
                                            .replace('{last_answer}', replyText);
        let convinceText = await findAWayToConvice(customSystemContent, customUserContent);
        if (convinceText.includes(CONVERSATION_FAILED)) {
            await handleConversationFailed({ from, userInfo, userState, conversationFailedResponse });
        } else {
            await handleConversation({ from, userInfo, userState, conversationText: convinceText });
        }
    }
}

async function sendGmail(subject: string, text: string): Promise<boolean> {
  // Check for required Gmail credentials
  if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
    console.error('Gmail credentials not set. Please provide GMAIL_USER and GMAIL_PASS in environment.');
    return false;
  }
  
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_PASS;
  console.log(`Sending email with user: ${user}`);
  
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass }
    });
    // Prettify the email body as HTML, right-to-left for Hebrew
    const htmlBody = `
      <html>
        <body style="direction: rtl; text-align: right; font-family: Arial, sans-serif; background: #f9f9f9; padding: 24px;">
          <div style="max-width: 600px; margin: auto; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px #eee; padding: 24px;">
            <h2 style="color: #2a4d8f;">${subject}</h2>
            <hr style="margin: 16px 0;">
            <pre style="font-size: 1.1em; white-space: pre-wrap; word-break: break-word; color: #222; background: #f4f4f4; border-radius: 4px; padding: 16px;">${text}</pre>
          </div>
        </body>
      </html>
    `;
    await transporter.sendMail({ from: user, to: SALES_INBOX_MAIL, subject, text, html: htmlBody });
    return true;
  } catch (err) {
    console.error('Failed to send email:', err);
    return false;
  }
}


const app = express();
app.use(bodyParser.json());

app.post('/whatsapp-webhook', async (req, res) => {
    // Always acknowledge fast
    res.sendStatus(200);

    try {
        if (req.body.object !== 'whatsapp_business_account') {
            return;
        }

        const entries = Array.isArray(req.body.entry) ? req.body.entry : [];
        for (const entry of entries) {
            const changes = Array.isArray(entry.changes) ? entry.changes : [];
            for (const change of changes) {
                const value = change.value || {};
                const messages = Array.isArray(value.messages) ? value.messages : [];

                for (const msg of messages) {
                    const fromRaw = String(msg.from || '');
                    // Normalize number to digits only, e.g., "9725xxxxxxx"
                    const from = fromRaw.replace(/\D/g, '');

                    // Extract the user's reply text in every possible format
                    let replyText = undefined;
                    if (msg.type === 'text' && msg.text?.body) {
                        replyText = msg.text.body;
                    } else if (msg.type === 'button' && msg.button?.text) {
                        replyText = msg.button.text;
                    } else if (msg.type === 'interactive') {
                        replyText =
                        msg.interactive?.button_reply?.title ||
                        msg.interactive?.list_reply?.title ||
                        undefined;
                    }

                    console.log('Incoming message:', {
                        type: msg.type,
                        from,
                        replyText,
                        msg,
                    });


                    // Fetch user data from MongoDB
                    let userRecord = await getConversationByState(from, 'Started');
                    let userState;
                    let userLastMessage;
                    let userInfo;
                    if (userRecord) {
                        // Parse conversation history from DB
                        userState = {
                        lastMessage: userRecord.lastMessage,
                        lastMessageText: userRecord.lastReply,
                        conversation: userRecord.fullConversation
                            ? userRecord.fullConversation.split('\n').map((line: string) => {
                                const match = line.match(/^(User|Agent): (.*)$/);
                                return match ? { from: (match[1]?.toLowerCase() ?? 'agent'), text: (match[2] ?? line) } : { from: 'agent', text: line };
                            })
                            : []
                        };
                        userLastMessage = userState.lastMessage;
                        userInfo = { firstName: userRecord.firstName, lastName: userRecord.lastName };
                    } else {
                        userState = { lastMessage: INTRO_TEMPLATE_MESSAGE, lastMessageText: '', conversation: [] };
                        userLastMessage = INTRO_TEMPLATE_MESSAGE;
                        userInfo = {};
                    }

                    if (!replyText) continue;
                    // Append user message to conversation
                    userState.conversation.push({ from: 'user', text: replyText });

                    // Save stateless conversation to MongoDB
                    await saveConversation({
                        phoneNumber: from,
                        firstName: userInfo.firstName || '',
                        lastName: userInfo.lastName || '',
                        fullConversation: userState.conversation.map((m: { from: string; text: string }) => `${m.from === 'user' ? 'User' : 'Agent'}: ${m.text}`).join('\n'),
                        lastMessage: userState.lastMessage,
                        lastReply: replyText,
                        timestamp: new Date().toISOString(),
                        conversationState: 'Started',
                        // conversationEndTimeStamp omitted for Started
                    });

                    let yesNoResult: string = '';
                    try {
                        yesNoResult = await askYesNoQuestion(replyText);
                    } catch (err) {
                        console.error('AI agent sentiment check failed:', err);
                    }

                    // State machine logic
                    if (userLastMessage === INTRO_TEMPLATE_MESSAGE) {
                        await handleIntroMessageState({ from, userInfo, userState, replyText, yesNoResult });
                    }

                    // Continue convince loop after each user reply to CUSTOM_CONVINCE_QUESTION_MESSAGE
                    else if (userLastMessage === CUSTOM_CONVINCE_QUESTION_MESSAGE) {
                        await handleCustomConversationState({ from, userInfo, userState, replyText });
                    }
                }
            }
        }
    } catch (err) {
        console.error('Webhook processing error:', err);
    }
});


// WhatsApp webhook verification (GET)
app.get('/whatsapp-webhook', (req, res) => {
  if (!process.env.WHATSAPP_VERIFY_TOKEN) {
    console.error('WHATSAPP_VERIFY_TOKEN environment variable is required');
    return res.status(500).send('Server configuration error');
  }
  
  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode && token && mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('WEBHOOK_VERIFIED');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Webhook endpoint to trigger the bot from Fireberry
app.post('/webhook', async (req, res) => {
  console.log('Webhook called with body:', req.body);
  const { firstName, lastName, phoneNumber } = req.body;
  if (!firstName || !lastName || !phoneNumber) {
    console.log('Missing required fields:', { firstName, lastName, phoneNumber });
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    // Set last_message and lastMessageMap for this user (like line 172 logic)
    last_message = INTRO_TEMPLATE_MESSAGE;
    const userKey = phoneNumber.replace(/^\+/, '');
    // Check for existing Started conversation
    const existingStarted = await getConversationByState(userKey, 'Started');
    if (existingStarted) {
      console.log(`[Webhook] Existing Started conversation for ${userKey}, not opening new.`);
      return res.json({ status: 'Existing conversation already started' });
    }

    const candidateName = `${firstName || ''} ${lastName || ''}`.trim();
    let customIntroQuestion = introQuestion;
    customIntroQuestion = introQuestion.replace('{candidate_name}', candidateName)
                                            .replace('{interviewer_name}', 'ג׳ובי')
                                            .replace('{company_name}', 'Bancara')
                                            .replace('{job_title}', 'Affiliate Manager');                                 

    // Create new record with Started state
    await saveConversation({
      phoneNumber: userKey,
      firstName,
      lastName,
      fullConversation: `Agent: ${customIntroQuestion}`,
      lastMessage: INTRO_TEMPLATE_MESSAGE,
      lastReply: '',
      timestamp: new Date().toISOString(),
      conversationState: 'Started'
      // conversationEndTimeStamp omitted for Started
    });
    // No global state: do not set lastMessageMap
    await sendTemplateMessage(phoneNumber, { firstName, lastName });
  // No global state: do not set pendingUsers
    res.json({ status: 'Template sent, waiting for user reply' });
  } catch (err) {
    console.error('Error sending template:', err);
    res.status(500).json({ error: 'Failed to send template', details: (err instanceof Error ? err.message : String(err)) });
  }
});

// Webhook endpoint to trigger the bot from Fireberry
app.post('/schedule-interview-webhook', async (req, res) => {
  console.log('Schedule Interview Webhook called with body:', req.body);
  const { firstName, lastName, phoneNumber } = req.body;
  if (!firstName || !lastName || !phoneNumber) {
    console.log('Missing required fields:', { firstName, lastName, phoneNumber });
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const candidateName = `${firstName || ''} ${lastName || ''}`.trim();
    let customEndOfConversation = endOfConversation.replace('{schedule_link}', scheduleLink).replace('{candidate_name}', candidateName);
    await sendWhatsAppMessage(phoneNumber, customEndOfConversation);
    res.json({ status: 'Schedule interview message sent' });
  } catch (err) {
    console.error('Error sending schedule interview message:', err);
    res.status(500).json({ error: 'Failed to send schedule interview message', details: (err instanceof Error ? err.message : String(err)) });
  }
});

const PORT = process.env.PORT || 3111;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


export { sendGmail };