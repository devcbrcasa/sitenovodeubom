// functions/seedAdmin.js - CORRIGIDO PARA AMBIENTES SERVERLESS

const mongoose = require('mongoose');
const User = require('../models/user'); // Certifique-se que o caminho está correto

// ❌ REMOVIDO: path, dotenv, e toda a lógica dotenv.config() que falhava no Netlify
// Assumimos que MONGODB_URI e outras variáveis são injetadas pelo ambiente.

// NOTA: Você está usando connectToDatabase de um arquivo './utils/db'. 
// Se esse arquivo não for compatível com serverless (reutilização de conexão), 
// esta função pode ainda ter problemas. Para simplificar, confiaremos na 
// injeção de variáveis de ambiente do Netlify.

// Se você não tem './utils/db', use a função de conexão simplificada abaixo:
const connectToDatabase = async () => {
    if (mongoose.connection.readyState === 1) return;

    if (!process.env.MONGODB_URI) {
        throw new Error('Please define the MONGODB_URI environment variable before connecting to the database.');
    }

    await mongoose.connect(process.env.MONGODB_URI);
};
// const connectToDatabase = require('./utils/db'); // Mantenha isso se utils/db existir e estiver correto

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'default_admin_password_strong';

async function seedAdmin() {
    console.log('Tentando conectar ao banco de dados...');
    try {
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
            // O campo 'role' não está no seu schema, removido para evitar erros
            // role: 'admin' 
        });

        // O user.js possui um hook pre-save que fará o hash da senha automaticamente.
        await newAdmin.save(); 
        console.log('Usuário administrador criado com sucesso!');

    } catch (error) {
        console.error('Erro ao criar usuário administrador:', error);
    } finally {
        if (mongoose.connection.readyState === 1) {
            // Desconecta após a operação para liberar recursos em uma função serverless
            await mongoose.disconnect();
            console.log('Conexão com o banco de dados fechada.');
        }
    }
}

// Executar a função de seed
seedAdmin();