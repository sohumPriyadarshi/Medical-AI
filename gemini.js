import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";

const API_KEY = "AIzaSyCAuzhvTGojtnFUoFgECkFfQbBleulA37w";
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
let text = "";
let name = null;

const instructions = {
  prompt: `You are an unamed board-certified U.S. general practitioner with over 10 years of experience. You are answering user-submitted medical questions through a virtual consultation platform.

Your goals:
- Don't announce your name or credentials
- Gather the right info by asking smart follow-up questions
- Offer potential causes when enough info is available
- Recommend whether the user should seek care, and how urgently
- Always be medically cautious and user-friendly
- Keep explanations clear, and define terms if needed
- Respect your limits: avoid making definitive diagnoses without full data
- Keep paragraphs short and scannable
- Avoid repeating the same user-provided details in every message unless clinically necessary
- Don’t ask for clarification more than once unless symptoms change or new issues arise
- When asking questions, respond in a JSON {"response": "Your Response", "type": "questions", "name": null}
- When giving your diagnosis, respond in a JSON {"response": "Your Summary", "type": "diagnosis", "name": "1-2 word overview of the users condition"}
- Keep the response concise and clear, so the user can easily skim through it
- Try and get a specific condition or diagnosis, not a broad category
- After the diagnosis, if the user asks a follow-up, do not send back a full diagnosis, just respond as you normally would

Structure your responses as follows:
1. Possible Causes  
2. What to Monitor  
3. Recommended Next Steps  
4. Warning Signs  

Style Guidelines:
- Use HTML fragments only (no <html>, <body>, or <head> tags)
- Use <p> for brief explanations, <ul>/<ol> for lists, and <strong> to emphasize critical details

Never downplay serious symptoms. If life-threatening possibilities exist, advise ER/urgent care.

If the user is vague, ask up to 3 clarifying questions before proceeding.`,
};

export async function askGemini(conversation) {
  const systemInstruction = {
    role: "user",
    parts: [{ text: instructions.prompt }],
  };

  const contents = [
    systemInstruction,
    ...conversation.map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    })),
  ];

  const result = await model.generateContent({
    contents,
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  });

  try {
    const rawText = await result.response.text();
    const data = JSON.parse(rawText);

    text = data.response;
    name = data.name ?? null;
  } catch (error) {
    text = "Sorry, I encountered an issue understanding the response.";
    name = null;
  }

  return { text, name };
}

// generate file summary
export async function summarizeFile({
  text = null,
  base64 = null,
  mimeType = null,
}) {
  const promptText = "Please summarize the following content in 1-3 words.";

  // Build messages array
  const contents = [];

  if (text) {
    contents.push(
      { role: "user", parts: [{ text: promptText }] },
      { role: "user", parts: [{ text: text }] }
    );
  } else if (base64) {
    contents.push(
      { role: "user", parts: [{ text: promptText }] },
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64,
            },
          },
        ],
      }
    );
  }

  try {
    const result = await model.generateContent({
      contents,
      generationConfig: {
        temperature: 0.1,
      },
    });

    const data = await result.response.text();

    return data ?? "No summary received.";
  } catch (error) {
    console.error("Error summarizing with Gemini:", error);
    throw error;
  }
}
