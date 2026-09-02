import express from 'express';
import path from 'path';
import { GoogleGenAI } from '@google/genai';

const PORT = 3000;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Server-side Gemini OCR Vision endpoint
  app.post('/api/ocr/analyze', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          error: 'GEMINI_API_KEY is not configured on server',
          fallback: true,
        });
      }

      const { image, mimeType } = req.body;
      if (!image || typeof image !== 'string') {
        return res.status(400).json({ error: 'Image data is required' });
      }

      // Strip data URL header if present
      const base64Data = image.replace(/^data:image\/[a-z]+;base64,/, '');
      const cleanMime = mimeType || 'image/jpeg';

      const ai = new GoogleGenAI({ apiKey });

      const ocrPrompt = `
أنت مدقق ومستخرج بيانات الفواتير والإيصالات لتطبيق "حساباتي | Hisabati".
افحص هذه الصورة واستخرج البيانات المالية بدقة متناهية.
المخرجات يجب أن تكون JSON فقط بدون أي نصوص تمهيدية، وفق البنية التالية:
{
  "documentType": { "value": "invoice" | "receipt" | "bill" | "statement" | "unknown", "confidence": 0.0-1.0 },
  "vendorName": { "value": "اسم المتجر أو المورد أو المؤسسة", "confidence": 0.0-1.0 },
  "customerName": { "value": "اسم العميل أو المشتري إن وجد وإلا null", "confidence": 0.0-1.0 },
  "invoiceNumber": { "value": "رقم الفاتورة أو السند إن وجد وإلا null", "confidence": 0.0-1.0 },
  "date": { "value": "YYYY-MM-DD", "confidence": 0.0-1.0 },
  "currency": { "value": "YER" | "SAR" | "USD" | "AED", "confidence": 0.0-1.0 },
  "subtotal": { "value": 0, "confidence": 0.0-1.0 },
  "tax": { "value": 0, "confidence": 0.0-1.0 },
  "totalAmount": { "value": 0, "confidence": 0.0-1.0 },
  "lineItems": [
    {
      "name": { "value": "اسم الصنف", "confidence": 0.0-1.0 },
      "quantity": { "value": 1, "confidence": 0.0-1.0 },
      "unitPrice": { "value": 0, "confidence": 0.0-1.0 },
      "totalPrice": { "value": 0, "confidence": 0.0-1.0 }
    }
  ],
  "rawText": "النص الكامل المقروء من الصورة",
  "overallConfidence": 0.0-1.0,
  "warnings": ["أي ملاحظة أو غموض في الفاتورة"]
}

قواعد صارمة:
1. المبالغ يجب أن تكون أرقاماً عادية (مثال 5000 أو 1250.5 وليس نصوصاً).
2. لا تختلق بيانات غير موجودة في الصورة.
3. التزم بصيغة JSON النقي.
      `.trim();

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              { text: ocrPrompt },
              {
                inlineData: {
                  data: base64Data,
                  mimeType: cleanMime,
                },
              },
            ],
          },
        ],
      });

      const responseText = (response.text || '').trim();
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Model did not return valid JSON');
      }

      const parsedData = JSON.parse(jsonMatch[0]);
      return res.json({ result: parsedData, provider: 'gemini-vision' });
    } catch (err: any) {
      console.error('OCR Vision server error:', err?.message || err);
      return res.status(500).json({
        error: err?.message || 'Error processing OCR with Gemini Vision',
        fallback: true,
      });
    }
  });

  // Server-side Gemini AI Chat endpoint
  app.post('/api/ai/chat', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          error: 'GEMINI_API_KEY is not configured on server',
          fallback: true,
        });
      }

      const { prompt, context } = req.body;
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'Prompt is required' });
      }

      const ai = new GoogleGenAI({ apiKey });

      const systemInstruction = `
أنت المساعد المالي الذكي لتطبيق "حساباتي | Hisabati".
تساعد المستخدمين باللغة العربية في معرفة الديون والمستحقات وحسابات العملاء.
قواعد صارمة:
1. لا تختلق أي أرقام أو أرصدة أو حسابات من عندك إطلاقاً.
2. اعتمد فقط على البيانات المالية المقدمة في السياق الأدنى.
3. إذا طلب المستخدم تسجيل عملية، استخرج الاسم والمبلغ ونوع القيد (له أو عليه) بوضوح لطلب التأكيد، ولا تدّعِ أنك قمت بالحفظ مباشرة لأن الحفظ يتطلب موافقة المستخدم.
      `.trim();

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `${systemInstruction}\n\nالسياق الحالي:\n${JSON.stringify(context || {})}\n\nسؤال المستخدم:\n${prompt}`,
              },
            ],
          },
        ],
      });

      const responseText = response.text || '';
      return res.json({ text: responseText, provider: 'gemini-server' });
    } catch (err: any) {
      console.error('Gemini server error:', err?.message || err);
      return res.status(500).json({
        error: err?.message || 'Error communicating with Gemini model',
        fallback: true,
      });
    }
  });

  // Vite development middleware or production static serving
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Hisabati server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
