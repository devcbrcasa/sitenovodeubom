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

// --- LOGS DE INICIALIZAÇÃO DA FUNÇÃO (para depuração) ---
console.log('chat.js: Função iniciada. Hora:', new Date().toISOString());
console.log('DEBUG: GEMINI_API_KEY from environment in chat.js:', process.env.GEMINI_API_KEY ? 'Key is present' : 'Key is MISSING or empty');
// --- FIM LOGS DE INICIALIZAÇÃO ---

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-05-20" });

// ROTA GET DE TESTE (para verificar se a função está respondendo)
router.get('/', (req, res) => {
    console.log('chat.js: Rota GET / acessada.');
    res.status(200).json({ message: 'Chatbot está online!' });
});

// A ROTA POST PRINCIPAL DEVE SER PARA A RAIZ DO SEU ROUTER, OU SEJA, '/'
// Quando o Netlify encaminha para /.netlify/functions/chat,
// o Express dentro da função vê isso como a raiz.
router.post('/', async (req, res) => { // <-- ESTE DEVE SER O CAMINHO '/'
    console.log('chat.js: Rota POST / acessada.');
    console.log('chat.js: Conteúdo do req.body:', JSON.stringify(req.body)); // Log do corpo da requisição

    try {
        const { contents } = req.body;

        if (!contents || !Array.isArray(contents)) {
            console.log('chat.js: Conteúdo da conversa inválido ou ausente no body.');
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
        console.error('chat.js: Erro ao processar mensagem do chatbot:', error);
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
