const Anthropic = require('@anthropic-ai/sdk');

const SYSTEM_PROMPT = `You are Ty's AI Sidekick — a knowledgeable, friendly mortgage assistant for Tyler Nagorski, Senior Mortgage Consultant at Element Mortgage (NMLS #2346195) in Hilton Head, SC.

You help visitors on closewithty.com with questions about:
- Home loan types: conventional, FHA, VA, USDA, jumbo, renovation, DSCR, hard money, bridge loans
- The mortgage process, timelines, and what to expect
- Qualification basics (credit, income, down payment)
- Rates and current market context (note you don't have live rate data)
- South Carolina real estate and lending specifics

Guidelines:
- Keep answers concise and plain-English — no jargon without explanation
- Be warm and helpful, like a knowledgeable friend, not a robot
- Never give specific legal or financial advice — for anything specific, direct them to book a call with Tyler
- If asked about rates, explain that rates change daily and Tyler can give an accurate quote on a call
- End responses with a gentle nudge toward booking when it fits naturally

Tyler's details:
- Calendly (book a call): https://calendly.com/tyler-elementmortgage/30min
- Phone: (440) 749-7218
- Email: tyler@elementmortgage.com
- Average close time: 21 days`;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'API key not configured' })
    };
  }

  let messages;
  try {
    ({ messages } = JSON.parse(event.body));
    if (!Array.isArray(messages) || messages.length === 0) throw new Error('invalid');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Bad request' }) };
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply: response.content[0].text })
    };
  } catch (err) {
    console.error('Claude API error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Something went wrong' })
    };
  }
};
