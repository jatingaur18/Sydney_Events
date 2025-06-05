const axios = require("axios");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function getRecommendationsFromGemini(userQuery, events) {
    
  const eventsForPrompt = events.slice(0, 10).map((e, i) => ({
    index: i + 1,
    title: e.title,
    description: e.shortCardDescription || "",
    link: e.originalUrl
  }));

  const prompt = `
You are given:
  1) A user’s interest: "${userQuery}"
  2) A list of events in Sydney (each with title, description, and a link).

Here are the events (only the first ${eventsForPrompt.length} shown):
${eventsForPrompt
  .map(
    (e) =>
      `${e.index}. Title: ${e.title}
   Description: ${e.description}
   Link: ${e.link}`
  )
  .join("\n\n")}

INSTRUCTIONS:
• Select the top 3 events that best match the user’s interest.
• Output a valid JSON array of exactly 3 objects. 
• Each object must have these three fields:
  {
    "title": string,
    "link": string,
    "explanation": string
  }
• The “link” field must come directly from the event’s “Link” above.
• The “explanation” should be a one‐sentence rationale for why that event matches the user’s interest.

For example (note: do NOT include this example in your answer—this is just formatting guidance):
[
  {
    "title": "Sample Event A",
    "link": "https://example.com/eventA",
    "explanation": "This event features live music that aligns with the user’s preference for a concert."
  },
  {
    "title": "Sample Event B",
    "link": "https://example.com/eventB",
    "explanation": "This workshop offers interactive DJ sets, which matches the user’s interest in music."
  },
  {
    "title": "Sample Event C",
    "link": "https://example.com/eventC",
    "explanation": "This open‐mic night focuses on indie bands, fitting the user’s request for music events."
  }
]

NOW, here is the response you should provide (only JSON, with no extra text outside the array):
`;

  try {
    const response = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent",
      {
        contents: [{ parts: [{ text: prompt }] }],
      },
      {
        params: { key: GEMINI_API_KEY },
        headers: { "Content-Type": "application/json" },
      }
    );

    // Gemini’s raw text
    const rawText =
      response.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    // Attempt to extract a JSON array from rawText
    // It may include trailing whitespace or markdown ticks, so we trim and
    // look for the first “[” and last “]”.
    const firstBracket = rawText.indexOf("[");
    const lastBracket = rawText.lastIndexOf("]");

    if (firstBracket === -1 || lastBracket === -1) {
      throw new Error("Could not find JSON array brackets in Gemini response.");
    }

    const jsonString = rawText.slice(firstBracket, lastBracket + 1).trim();

    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (parseErr) {
      console.error("JSON.parse failed:", parseErr.message, "\nRaw text:", rawText);
      throw new Error("Failed to parse JSON from Gemini response.");
    }

    // Ensure it’s an array of exactly 3 objects with the expected fields
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 3 ||
      !parsed.every((obj) =>
        obj.title && obj.link && obj.explanation
      )
    ) {
      throw new Error("Parsed JSON does not match the required schema.");
    }

    // Return the array of { title, link, explanation }
    return parsed;
  } catch (error) {
    console.error("Gemini API / parsing error:", error.message);
    // Return a user‐friendly fallback
    return [
      {
        title: "Error retrieving recommendations",
        link: "",
        explanation: "There was an issue fetching or parsing recommendations from Gemini."
      }
    ];
  }
}

module.exports = getRecommendationsFromGemini;
