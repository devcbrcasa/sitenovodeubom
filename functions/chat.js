// functions/chat.js

const express = require('express');
const serverless = require('serverless-http');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const router = express.Router();

// Middleware para parsear JSON
app.use(express.json());

// Configura a Google Generative AI com sua chave de API
// console.log('DEBUG: GEMINI_API_KEY from environment in chat.js:', process.env.GEMINI_API_KEY ? 'Key is present' : 'Key is MISSING or empty');

// A ROTA POST DEVE SER PARA A RAIZ DO SEU ROUTER, OU SEJA, '/'
router.post('/', async (req, res) => { // <-- ESTE DEVE SER O CAMINHO '/'
    try {
        const { contents } = req.body;

        if (!contents || !Array.isArray(contents)) {
            return res.status(400).json({ message: 'Conteúdo da conversa inválido.' });
        }

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-05-20" });

        const chat = model.startChat({
            history: contents.slice(0, -1),
            generationConfig: {
                temperature: 0.7,
                topP: 0.95,
                topK: 40,
            },
        });

        const lastUserMessage = contents[contents.length - 1].parts[0].text;
        const result = await chat.sendMessage(lastUserMessage);
        const response = await result.response;
        const text = response.text();

        res.json({ text });

    } catch (error) {
        console.error('Erro ao processar mensagem do chatbot (chat.js):', error);
        if (error.message.includes("403") || error.message.includes("PERMISSION_DENIED")) {
            res.status(403).json({ message: 'Erro de autenticação com a API. Verifique sua chave GEMINI_API_KEY.', error: error.message });
        } else {
            res.status(500).json({ message: 'Erro interno do servidor ao se comunicar com a IA.', error: error.message });
        }
    }
});

// O Express app.use DEVE USAR A RAIZ ('/') PARA ESTA FUNÇÃO
app.use('/', router); // <-- ESTE DEVE SER O CAMINHO '/'

module.exports.handler = serverless(app);
