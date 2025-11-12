import { askYesNoQuestion } from './llm.js';

export { askYesNoQuestion };
import axios from 'axios';

if (!process.env.WHATSAPP_ACCESS_TOKEN) {
  throw new Error('WHATSAPP_ACCESS_TOKEN environment variable is required');
}

if (!process.env.WHATSAPP_PHONE_NUMBER_ID) {
  throw new Error('WHATSAPP_PHONE_NUMBER_ID environment variable is required');
}

const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;


// Utility to sanitize text for WhatsApp template
function sanitize(text: string): string {
  return text.replace(/[^\w\s\u0590-\u05FF]/g, '').trim();
}

// Send a WhatsApp template message (job_application_intro, he)
export async function sendTemplateMessage(
  phoneNumber: string,
  candidate: { firstName?: string, lastName?: string }
) {
  const url = `https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const candidateName = `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim();
  const formattedPhone = formatPhoneNumber(phoneNumber);
  const templateName = 'smart_interview_template'; // Ensure this template is created in your WhatsApp Business Account
  const payload: any = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: formattedPhone,
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'he' },
      components: [
        {
          type: 'body',
          parameters: [
            {
              type: 'text',
              parameter_name: 'candidate_name',
              text: sanitize(candidateName || ''),
            },
            {
              type: 'text',
              parameter_name: 'interviewer_name',
              text: sanitize('ג׳ובי'),
            },
            {
              type: 'text',
              parameter_name: 'company_name',
              text: sanitize('Bancara'),
            },
            {
              type: 'text',
              parameter_name: 'job_title',
              text: sanitize('Affiliate Manager'),
            },
          ],
        },
      ],
    },
  };
  try {
    const response = await axios.post(url, payload, {
      headers: {
        'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    console.log(`[WhatsApp API] Template sent to ${phoneNumber}: job_application_intro`);
    if (response.data) console.log('[WhatsApp API] Template Response:', response.data);
  } catch (err) {
    console.error('[WhatsApp API] Error sending template message:', err);
  }
}


// format phone number
export function formatPhoneNumber(inputNumber: string): string {
  let formattedNumber = inputNumber.trim();

  formattedNumber = formattedNumber.replace(/\D/g, "");

  if (formattedNumber.startsWith("0")) {
    formattedNumber = "972" + formattedNumber.substring(1);
  } else if (
    formattedNumber.startsWith("972") &&
    formattedNumber.length === 12
  ) {
    return formattedNumber;
  }

  return formattedNumber;
}

export async function sendWhatsAppMessage(phoneNumber: string, message: string): Promise<void> {
  const url = `https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const data = {
    messaging_product: 'whatsapp',
    to: phoneNumber,
    type: 'text',
    text: { body: message }
  };
  try {
    const response = await axios.post(url, data, {
      headers: {
        'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    console.log(`[WhatsApp API] Sent to ${phoneNumber}: ${message}`);
    if (response.data) console.log('[WhatsApp API] Response:', response.data);
  } catch (err) {
    console.error('[WhatsApp API] Error sending message:', err);
  }
}

