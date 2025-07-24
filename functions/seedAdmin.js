const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const connectToDatabase = require('./utils/db');
const User = require('./models/User'); // Certifique-se que o nome do arquivo do modelo User é 'User.js' com 'U' maiúsculo

// Define o caminho para a raiz do projeto de forma absoluta
// __dirname é o diretório do arquivo seedAdmin.js (functions/)
// path.resolve() vai para o diretório pai (sie-cbr-novo) e busca o .env
const dotenvPath = path.resolve(__dirname, '..', '.env');

// --- ÚNICA CHAMADA DOTENV E DIAGNÓSTICO ---
const dotenvResult = dotenv.config({ path: dotenvPath });

if (dotenvResult.error) {
    console.error('Erro ao carregar .env:', dotenvResult.error);
    // Adicionar um throw aqui para parar a execução se o .env não for carregado
    throw dotenvResult.error;
} else {
    console.log('Variáveis carregadas pelo dotenv:', dotenvResult.parsed);
}
console.log('Caminho do .env procurado:', dotenvPath); // ADICIONADO PARA DEBUG
console.log('Conteúdo de process.env.MONGODB_URI (APÓS DOTENV):', process.env.MONGODB_URI);
console.log('Conteúdo de process.env.JWT_SECRET (APÓS DOTENV):', process.env.JWT_SECRET);
// --- FIM DA ÚNICA CHAMADA DOTENV E DIAGNÓSTICO ---


const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'default_admin_password_strong';

async function seedAdmin() {
    console.log('Tentando conectar ao banco de dados...');
    try {
        // Verifica se MONGODB_URI está definido ANTES de tentar conectar
        if (!process.env.MONGODB_URI) {
            throw new Error('Please define the MONGODB_URI environment variable before connecting to the database.');
        }

        await connectToDatabase();
        console.log('Conexão com o banco de dados estabelecida.');

        const existingAdmin = await User.findOne({ username: ADMIN_USERNAME });

        if (existingAdmin) {
            console.log('Usuário administrador já existe.');
            return;
        }

        const newAdmin = new User({
            username: ADMIN_USERNAME,
            password: ADMIN_PASSWORD,
            role: 'admin'
        });

        await newAdmin.save();
        console.log('Usuário administrador criado com sucesso!');

    } catch (error) {
        console.error('Erro ao criar usuário administrador:', error);
    } finally {
        if (mongoose.connection.readyState === 1) {
            await mongoose.disconnect();
            console.log('Conexão com o banco de dados fechada.');
        }
    }
}

// Executar a função de seed
seedAdmin();