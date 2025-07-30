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
// Certifique-se de que process.env.GEMINI_API_KEY esteja configurado no Netlify
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-05-20" });

router.post('/chat', async (req, res) => {
    try {
        const { contents } = req.body; // 'contents' deve ser o histórico da conversa

        if (!contents || !Array.isArray(contents)) {
            return res.status(400).json({ message: 'Conteúdo da conversa inválido.' });
        }

        // Inicia um novo chat com o histórico fornecido
        const chat = model.startChat({
            history: contents.slice(0, -1), // Exclui a última mensagem (a do usuário atual) do histórico para evitar duplicação
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
        res.status(500).json({ message: 'Erro interno do servidor ao se comunicar com a IA.', error: error.message });
    }
});

// Prefixo para as rotas da Netlify Function
app.use('/.netlify/functions/chat', router);

module.exports.handler = serverless(app);