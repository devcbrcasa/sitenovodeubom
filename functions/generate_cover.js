// functions/generate_cover.js

const express = require('express');
const serverless = require('serverless-http');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require('@google/generative-ai');

dotenv.config();

const app = express();
const router = express.Router();

// Middleware para parsear JSON
app.use(express.json());

// --- LOGS DE INICIALIZAÇÃO DA FUNÇÃO ---
console.log('generate_cover.js: Função iniciada. Hora:', new Date().toISOString());
console.log('DEBUG: GEMINI_API_KEY from environment in generate_cover.js:', process.env.GEMINI_API_KEY ? 'Key is present' : 'Key is MISSING or empty');
// --- FIM LOGS DE INICIALIZAÇÃO ---

// Middleware de log para todas as requisições que chegam ao Express
app.use((req, res, next) => {
    console.log(`generate_cover.js: Requisição recebida - Método: ${req.method}, URL: ${req.url}`);
    next();
});

// Configura a Google Generative AI com sua chave de API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "imagen-3.0-generate-002" });

// --- ROTA GET DE TESTE ---
// Tente acessar esta URL diretamente no seu navegador:
// https://produtorarealidade.netlify.app/.netlify/functions/generate_cover
// Se funcionar, você deve ver: {"message":"Gerador de capas está online!"}
router.get('/', (req, res) => {
    console.log('generate_cover.js: Rota GET / acessada.');
    res.status(200).json({ message: 'Gerador de capas está online!' });
});
// --- FIM ROTA GET DE TESTE ---

// A ROTA POST PRINCIPAL DEVE SER PARA A RAIZ DO SEU ROUTER, OU SEJA, '/'
// Quando o Netlify encaminha para /.netlify/functions/generate_cover,
// o Express dentro da função vê isso como a raiz.
router.post('/', async (req, res) => {
    console.log('generate_cover.js: Rota POST / acessada.');
    console.log('generate_cover.js: Conteúdo do req.body:', JSON.stringify(req.body)); // Log do corpo da requisição

    try {
        const { prompt } = req.body;

        if (!prompt) {
            console.log('generate_cover.js: Prompt vazio recebido no body.');
            return res.status(400).json({ message: 'A descrição da capa (prompt) é obrigatória.' });
        }

        const payload = {
            instances: { prompt: prompt },
            parameters: { "sampleCount": 1 }
        };

        const apiKey = process.env.GEMINI_API_KEY;
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`;

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (result.predictions && result.predictions.length > 0 && result.predictions[0].bytesBase64Encoded) {
            const base64Data = result.predictions[0].bytesBase64Encoded;
            const imageUrl = `data:image/png;base64,${base64Data}`;
            res.json({ imageUrl });
        } else {
            console.error('generate_cover.js: Estrutura de resposta inesperada da API Imagen:', result);
            res.status(500).json({ message: 'Não foi possível gerar a imagem. Estrutura de resposta inesperada da IA.' });
        }

    } catch (error) {
        console.error('generate_cover.js: Erro ao gerar capa de música (generate_cover.js):', error);
        if (error.message.includes("403") || error.message.includes("PERMISSION_DENIED")) {
            res.status(403).json({ message: 'Erro de autenticação com a API. Verifique sua chave GEMINI_API_KEY.', error: error.message });
        } else {
            res.status(500).json({ message: 'Erro interno do servidor ao gerar a capa.', error: error.message });
        }
    }
});

// O Express app.use DEVE USAR A RAIZ ('/') PARA ESTA FUNÇÃO
// Isso significa que a função 'generate_cover' responderá diretamente a /.netlify/functions/generate_cover
app.use('/', router);

module.exports.handler = serverless(app);
