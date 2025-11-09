const fetch = globalThis.fetch;

module.exports = async (req, res) => {
  console.log(`[${new Date().toISOString()}] [API] ${req.method} /api/chat`);

  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET,OPTIONS,PATCH,DELETE,POST,PUT'
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_APIKEY;
  if (!apiKey) {
    console.error('[API] Missing GEMINI_API_KEY');
    return res
      .status(500)
      .json({ error: 'AI service not configured', code: 'missing_api_key' });
  }

  try {
    const {
      message,
      history = [],
      system,
      temperature
    } = req.body || {};

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    const rawModel = (process.env.GEMINI_MODEL || 'models/gemini-2.5-flash').trim();
    const normalizedModel = rawModel.startsWith('models/') ? rawModel : `models/${rawModel}`;

    const promptHistory = history
      .slice(-10)
      .map(entry => {
        const text = entry?.text ?? entry?.content ?? '';
        if (!text) {
          return null;
        }

        const role =
          entry?.role === 'user'
            ? 'user'
            : entry?.role === 'assistant' || entry?.role === 'model'
              ? 'model'
              : 'user';

        return {
          role,
          parts: [{ text: String(text) }]
        };
      })
      .filter(Boolean);

    const baseInstruction =
      typeof system === 'string' && system.trim().length > 0
        ? system.trim()
        : 'You are FamilyHub Assistant, a friendly study and planning helper for students and families. Provide practical study tips, time management strategies, and clear explanations. Keep responses concise (under 6 sentences) unless more detail is explicitly requested.';

    const contents = [
      {
        role: 'user',
        parts: [{ text: baseInstruction }]
      },
      ...promptHistory,
      {
        role: 'user',
        parts: [{ text: message }]
      }
    ];

    const requestBody = {
      contents
    };

    if (typeof temperature === 'number' && Number.isFinite(temperature)) {
      const tempClamped = Math.min(Math.max(temperature, 0), 1.9);
      requestBody.generationConfig = {
        temperature: tempClamped
      };
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${normalizedModel}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      }
    );

    let data;

    if (!response.ok) {
      const rawBody = await response.text().catch(() => '');
      let errorBody = {};
      try {
        errorBody = rawBody ? JSON.parse(rawBody) : {};
      } catch (parseError) {
        errorBody = { raw: rawBody };
      }

      console.error('[API] Gemini error response', {
        status: response.status,
        statusText: response.statusText,
        body: errorBody
      });

      const apiMessage =
        errorBody?.error?.message ||
        errorBody?.message ||
        response.statusText ||
        'Gemini API returned a non-success status';

      const statusCode =
        response.status && response.status >= 400 && response.status < 600 ? response.status : 500;

      return res.status(statusCode).json({
        error: 'Failed to generate response',
        message: apiMessage,
        details: {
          status: response.status,
          statusText: response.statusText,
          body: errorBody
        }
      });
    } else {
      data = await response.json();
    }

    const blockedReason =
      data?.promptFeedback?.blocked ||
      data?.promptFeedback?.blockReason ||
      data?.candidates?.[0]?.safetyRatings?.some(rating => rating.blocked);

    if (blockedReason) {
      console.warn('[API] Gemini safety block triggered', data?.promptFeedback);
      return res.status(400).json({
        error: 'Request was blocked by Gemini safety policies',
        message:
          data?.promptFeedback?.blockReason ||
          data?.promptFeedback?.safetyRatings?.find(rating => rating.blocked)?.category ||
          'Gemini refused to answer this prompt due to safety rules.',
        details: data?.promptFeedback
      });
    }

    const candidates = data?.candidates || [];
    const reply =
      candidates[0]?.content?.parts?.map(part => part.text || '').join('\n') ||
      'I’m not sure how to respond to that yet.';

    res.json({ success: true, reply });
  } catch (error) {
    console.error('[API] Error calling Gemini API:', error);
    res
      .status(500)
      .json({
        error: 'Failed to process AI request',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
  }
};

