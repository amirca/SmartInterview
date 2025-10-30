/**
 * Uses OpenAI to generate a polite, gentle, and convincing response in Hebrew to try to get the user to agree.
 * @param agentPrompt - The agent's prompt with Q&A instructions in Hebrew for the situation.
 * @param lastMessageText - The last message text sent to the user (the question asked).
 * @param replyText - The reply text from the user, providing context for the response.
 * @returns {Promise<string>} - A short, polite, and gentle answer to convince the user.
 */

export async function summarizeConversation(userContent: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    temperature: 0.7,
    max_tokens: 400,
    messages: [
      { role: 'user', content: userContent }
    ],
  });
  let text = response.choices[0]?.message?.content?.trim() || '';
  // Remove leading/trailing quotes if present
  text = text.replace(/^"|"$/g, '').trim();
  return text;
}

export async function findAWayToConvice(systemContent: string, userContent: string): Promise<string> {
    const response = await openai.chat.completions.create({
        model: 'gpt-4',
        temperature: 0.7,
        max_tokens: 400,
        messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent },
        ],
    });
    let text = response.choices[0]?.message?.content?.trim() || '';
    // Remove leading/trailing quotes if present
    text = text.replace(/^"|"$/g, '').trim();
    if (text.toLowerCase().startsWith('agent:')) {
        text = text.slice(6).trim();
    }
    return text;
}

import OpenAI from 'openai';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY environment variable is required');
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function askYesNoQuestion(answer: string): Promise<'yes' | 'no'> {
  const systemPrompt = "I'm going to write few words and sentences in English and in Hebrew. I want you to answer by yes for positive connotation and by no for negative connotation.";
  const userPrompt = "I'm going to write few words and sentences in English and in Hebrew. I want you to answer by yes for positive connotation and by no for negative connotation: '" + answer.toLowerCase() + "'";
  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    temperature: 0.2,
    max_tokens: 400,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });
  const text = response.choices[0]?.message?.content?.trim().toLowerCase() || '';
  console.log(`[AI Agent] Reply text: ${text}`);
  return text.startsWith('y') ? 'yes' : 'no';
}
