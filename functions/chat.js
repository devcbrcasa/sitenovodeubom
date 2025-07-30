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
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-05-20" });

// A rota agora é definida como '/' para que ela responda ao caminho base da função
router.post('/', async (req, res) => { // Alterado de '/chat' para '/'
    try {
        const { contents } = req.body;

        if (!contents || !Array.isArray(contents)) {
            return res.status(400).json({ message: 'Conteúdo da conversa inválido.' });
        }

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
        console.error('Erro ao processar mensagem do chatbot:', error);
        // Verifica se o erro é de permissão da API
        if (error.message.includes("403") || error.message.includes("PERMISSION_DENIED")) {
            res.status(403).json({ message: 'Erro de autenticação com a API. Verifique sua chave GEMINI_API_KEY.', error: error.message });
        } else {
            res.status(500).json({ message: 'Erro interno do servidor ao se comunicar com a IA.', error: error.message });
        }
    }
});

// O prefixo para a rota da Netlify Function agora é apenas '/'
// Isso significa que a função 'chat' responderá diretamente a /.netlify/functions/chat
app.use('/', router); // Alterado de '/.netlify/functions/chat' para '/'

module.exports.handler = serverless(app);
