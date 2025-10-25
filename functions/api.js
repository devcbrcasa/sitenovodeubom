// functions/api.js - CORRIGIDO PARA AMBIENTES NETLIFY FUNCTIONS

const express = require('express');
const serverless = require('serverless-http');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

// ❌ REMOVIDO: dotenv.config() - O Netlify injeta as variáveis automaticamente.

const app = express();
const router = express.Router();

// ---------------------------------------------------
// 1. OTIMIZAÇÃO DA CONEXÃO MONGODB PARA SERVERLESS
// ---------------------------------------------------

let isConnected = false;

const connectToDatabase = async () => {
    // Retorna se a conexão já estiver estabelecida
    if (isConnected && mongoose.connection.readyState === 1) {
        return;
    }
    
    // Assegura que o MONGODB_URI existe (injecado pelo Netlify)
    if (!process.env.MONGODB_URI) {
         console.error('MONGODB_URI não está definida nas variáveis de ambiente!');
         return;
    }

    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            // As opções useNewUrlParser e useUnifiedTopology foram removidas/comentadas,
            // pois são obsoletas no Mongoose 6+ e causam warnings.
            // useNewUrlParser: true,
            // useUnifiedTopology: true,
        });
        isConnected = true;
        console.log('MongoDB conectado com sucesso (Serverless).');
    } catch (err) {
        console.error('Erro de conexão com MongoDB (Serverless):', err);
        isConnected = false;
    }
};

// ---------------------------------------------------
// 2. IMPORTAÇÃO DOS MODELOS (NENHUM SCHEMA DEFINIDO AQUI)
// ---------------------------------------------------

// Importa os modelos corrigidos e modularizados
const User = require('../models/user'); 
const Project = require('../models/project');
const PortfolioItem = require('../models/portfolio');
const SocialLinks = require('../models/sociallinks');
const Testimonial = require('../models/testimonial'); // Novo arquivo criado acima

// ---------------------------------------------------
// 3. MIDDLEWARES
// ---------------------------------------------------

app.use(express.json());

// Middleware para garantir a conexão com o DB em cada requisição
router.use(async (req, res, next) => {
    await connectToDatabase();
    next();
});

// Middleware de Autenticação (Mantido o seu código original)
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Acesso negado. Token não fornecido.' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(403).json({ message: 'Sua sessão expirou. Por favor, faça login novamente.' });
            }
            return res.status(403).json({ message: 'Token inválido ou expirado.' });
        }
        req.user = user;
        next();
    });
};

// ---------------------------------------------------
// 4. ROTAS DE AUTENTICAÇÃO
// ---------------------------------------------------

// Rota de Login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ message: 'Credenciais inválidas.' });
        }

        // Usando o método .comparePassword definido no models/user.js
        const isMatch = await user.comparePassword(password);
        
        if (!isMatch) {
            return res.status(400).json({ message: 'Credenciais inválidas.' });
        }

        const token = jwt.sign({ id: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '8h' });
        res.json({ message: 'Login bem-sucedido!', token });
    } catch (error) {
        res.status(500).json({ message: 'Erro no servidor.', error: error.message });
    }
});

// Rota para Alterar Senha (protegida)
router.post('/change-password', authenticateToken, async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }

        // Usando o método .comparePassword definido no models/user.js
        const isMatch = await user.comparePassword(oldPassword);
        if (!isMatch) {
            return res.status(400).json({ message: 'Senha antiga incorreta.' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ message: 'A nova senha deve ter no mínimo 6 caracteres.' });
        }

        // O hook 'pre-save' no models/user.js fará o hash
        user.password = newPassword; 
        await user.save();
        res.json({ message: 'Senha alterada com sucesso!' });
    } catch (error) {
        res.status(500).json({ message: 'Erro no servidor.', error: error.message });
    }
});

// Rota para criar o primeiro usuário admin (apenas para inicialização)
router.post('/create-first-admin', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Nome de usuário e senha são obrigatórios.' });
    }
    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(409).json({ message: 'Usuário já existe.' });
        }
        // O hook 'pre-save' no models/user.js fará o hash automaticamente
        const newUser = new User({ username, password });
        await newUser.save();
        res.status(201).json({ message: 'Primeiro usuário admin criado com sucesso.' });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao criar usuário admin.', error: error.message });
    }
});


// --- Rotas CRUD para Projetos ---
// Obter todos os projetos
router.get('/projects', async (req, res) => {
    try {
        const projects = await Project.find({});
        res.json(projects);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar projetos.', error: error.message });
    }
});

// Adicionar novo projeto
router.post('/projects', authenticateToken, async (req, res) => {
    try {
        const newProject = new Project(req.body);
        await newProject.save();
        res.status(201).json({ message: 'Projeto adicionado com sucesso!', project: newProject });
    } catch (error) {
        res.status(400).json({ message: 'Erro ao adicionar projeto.', error: error.message });
    }
});

// Atualizar projeto por ID
router.put('/projects/:id', authenticateToken, async (req, res) => {
    try {
        const updatedProject = await Project.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedProject) {
            return res.status(404).json({ message: 'Projeto não encontrado.' });
        }
        res.json({ message: 'Projeto atualizado com sucesso!', project: updatedProject });
    } catch (error) {
        res.status(400).json({ message: 'Erro ao atualizar projeto.', error: error.message });
    }
});

// Excluir projeto por ID
router.delete('/projects/:id', authenticateToken, async (req, res) => {
    try {
        const deletedProject = await Project.findByIdAndDelete(req.params.id);
        if (!deletedProject) {
            return res.status(404).json({ message: 'Projeto não encontrado.' });
        }
        res.status(204).send(); // No Content
    } catch (error) {
        res.status(500).json({ message: 'Erro ao excluir projeto.', error: error.message });
    }
});

// --- Rotas CRUD para Portfólio ---
// Obter todos os itens de portfólio
router.get('/portfolio', async (req, res) => {
    try {
        const portfolioItems = await PortfolioItem.find({});
        res.json(portfolioItems);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar itens de portfólio.', error: error.message });
    }
});

// Adicionar novo item de portfólio
router.post('/portfolio', authenticateToken, async (req, res) => {
    try {
        const newItem = new PortfolioItem(req.body);
        await newItem.save();
        res.status(201).json({ message: 'Item de portfólio adicionado com sucesso!', item: newItem });
    } catch (error) {
        res.status(400).json({ message: 'Erro ao adicionar item de portfólio.', error: error.message });
    }
});

// Atualizar item de portfólio por ID
router.put('/portfolio/:id', authenticateToken, async (req, res) => {
    try {
        const updatedItem = await PortfolioItem.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedItem) {
            return res.status(404).json({ message: 'Item de portfólio não encontrado.' });
        }
        res.json({ message: 'Item de portfólio atualizado com sucesso!', item: updatedItem });
    } catch (error) {
        res.status(400).json({ message: 'Erro ao atualizar item de portfólio.', error: error.message });
    }
});

// Excluir item de portfólio por ID
router.delete('/portfolio/:id', authenticateToken, async (req, res) => {
    try {
        const deletedItem = await PortfolioItem.findByIdAndDelete(req.params.id);
        if (!deletedItem) {
            return res.status(404).json({ message: 'Item de portfólio não encontrado.' });
        }
        res.status(204).send(); // No Content
    } catch (error) {
        res.status(500).json({ message: 'Erro ao excluir item de portfólio.', error: error.message });
    }
});

// --- Rotas para Links Sociais ---
// Obter links sociais
router.get('/social-links', async (req, res) => {
    try {
        // Encontra ou cria o único documento
        const socialLinks = await SocialLinks.findOneAndUpdate({}, {}, { new: true, upsert: true });
        res.json(socialLinks);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar links sociais.', error: error.message });
    }
});

// Atualizar links sociais
router.put('/social-links', authenticateToken, async (req, res) => {
    try {
        // Encontra ou cria o único documento e o atualiza
        const socialLinks = await SocialLinks.findOneAndUpdate({}, req.body, { new: true, upsert: true });
        res.json({ message: 'Links sociais atualizados com sucesso!', socialLinks });
    } catch (error) {
        res.status(400).json({ message: 'Erro ao atualizar links sociais.', error: error.message });
    }
});

// --- ROTAS PARA DEPOIMENTOS ---

// Rota para submeter um novo depoimento (público)
router.post('/testimonials', async (req, res) => {
    try {
        const { name, rating, comment } = req.body;
        if (!name || !rating || !comment) {
            return res.status(400).json({ message: 'Nome, avaliação e depoimento são obrigatórios.' });
        }
        const newTestimonial = new Testimonial({ name, rating, comment, approved: false }); // Usa o modelo Testimonial importado
        await newTestimonial.save();
        res.status(201).json({ message: 'Depoimento enviado com sucesso para revisão!', testimonial: newTestimonial });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao enviar depoimento.', error: error.message });
    }
});

// Rota para obter depoimentos APROVADOS (público)
router.get('/testimonials', async (req, res) => {
    try {
        const approvedTestimonials = await Testimonial.find({ approved: true }).sort({ createdAt: -1 });
        res.json(approvedTestimonials);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar depoimentos aprovados.', error: error.message });
    }
});

// Rota para obter TODOS os depoimentos (admin-only)
router.get('/testimonials/all', authenticateToken, async (req, res) => {
    try {
        const allTestimonials = await Testimonial.find({}).sort({ createdAt: -1 });
        res.json(allTestimonials);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar todos os depoimentos.', error: error.message });
    }
});

// Rota para aprovar um depoimento (admin-only)
router.put('/testimonials/:id/approve', authenticateToken, async (req, res) => {
    try {
        const updatedTestimonial = await Testimonial.findByIdAndUpdate(
            req.params.id,
            { approved: true },
            { new: true }
        );
        if (!updatedTestimonial) {
            return res.status(404).json({ message: 'Depoimento não encontrado.' });
        }
        res.json({ message: 'Depoimento aprovado com sucesso!', testimonial: updatedTestimonial });
    } catch (error) {
        res.status(400).json({ message: 'Erro ao aprovar depoimento.', error: error.message });
    }
});

// Rota para excluir um depoimento (admin-only)
router.delete('/testimonials/:id', authenticateToken, async (req, res) => {
    try {
        const deletedTestimonial = await Testimonial.findByIdAndDelete(req.params.id);
        if (!deletedTestimonial) {
            return res.status(404).json({ message: 'Depoimento não encontrado.' });
        }
        res.status(204).send(); // No Content
    } catch (error) {
        res.status(500).json({ message: 'Erro ao excluir depoimento.', error: error.message });
    }
});

// Prefixo para as rotas da Netlify Function
app.use('/.netlify/functions/api', router);

module.exports.handler = serverless(app);