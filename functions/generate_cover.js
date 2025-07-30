// functions/generate_cover.js

const express = require('express');
const serverless = require('serverless-http');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const router = express.Router();

// Middleware para parsear JSON
app.use(express.json());

// Rota para gerar capa de música agora é definida como '/'
router.post('/', async (req, res) => { // Alterado de '/generate-cover' para '/'
    try {
        const { prompt } = req.body;

        if (!prompt) {
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
            console.error('Estrutura de resposta inesperada da API Imagen:', result);
            res.status(500).json({ message: 'Não foi possível gerar a imagem. Estrutura de resposta inesperada da IA.' });
        }

    } catch (error) {
        console.error('Erro ao gerar capa de música:', error);
        if (error.message.includes("403") || error.message.includes("PERMISSION_DENIED")) {
            res.status(403).json({ message: 'Erro de autenticação com a API. Verifique sua chave GEMINI_API_KEY.', error: error.message });
        } else {
            res.status(500).json({ message: 'Erro interno do servidor ao gerar a capa.', error: error.message });
        }
    }
});

// O prefixo para a rota da Netlify Function agora é apenas '/'
// Isso significa que a função 'generate_cover' responderá diretamente a /.netlify/functions/generate_cover
app.use('/', router); // Alterado de '/.netlify/functions/generate-cover' para '/'

module.exports.handler = serverless(app);
