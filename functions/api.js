const express = require('express');
const serverless = require('serverless-http');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const router = express.Router();

// Middleware para parsear JSON
app.use(express.json());

// Conexão com o MongoDB
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('MongoDB conectado com sucesso.'))
.catch(err => console.error('Erro de conexão com MongoDB:', err));

// --- Schemas Mongoose ---

// Schema para Usuário (Admin)
const UserSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    }
});

const User = mongoose.model('User', UserSchema);

// Schema para Projetos
const ProjectSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    image_url: { type: String },
    spotify_link: { type: String, required: true },
    youtube_link: { type: String, required: true },
});

const Project = mongoose.model('Project', ProjectSchema);

// Schema para Portfólio
const PortfolioItemSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    image_url: { type: String },
    spotify_link: { type: String, required: true },
    youtube_link: { type: String, required: true },
});

const PortfolioItem = mongoose.model('PortfolioItem', PortfolioItemSchema);

// Schema para Links Sociais
const SocialLinksSchema = new mongoose.Schema({
    instagram: { type: String, default: '' },
    facebook: { type: String, default: '' },
    spotify: { type: String, default: '' },
    youtube: { type: String, default: '' },
});

const SocialLinks = mongoose.model('SocialLinks', SocialLinksSchema);

// NOVO SCHEMA PARA DEPOIMENTOS
const TestimonialSchema = new mongoose.Schema({
    name: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true },
    approved: { type: Boolean, default: false }, // Depoimentos começam como não aprovados
    createdAt: { type: Date, default: Date.now }
});

const Testimonial = mongoose.model('Testimonial', TestimonialSchema);

// --- Middleware de Autenticação ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Acesso negado. Token não fornecido.' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            console.error('Erro de verificação de token:', err); // Loga o erro para depuração
            // Se o erro for de token expirado, envia uma mensagem específica
            if (err.name === 'TokenExpiredError') {
                return res.status(403).json({ message: 'Sua sessão expirou. Por favor, faça login novamente.' });
            }
            return res.status(403).json({ message: 'Token inválido ou expirado.' });
        }
        req.user = user;
        next();
    });
};

// --- Rotas de Autenticação ---

// Rota de Login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ message: 'Credenciais inválidas.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Credenciais inválidas.' });
        }

        // AQUI: Tempo de expiração do token alterado para 8 horas
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

        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Senha antiga incorreta.' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ message: 'A nova senha deve ter no mínimo 6 caracteres.' });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();
        res.json({ message: 'Senha alterada com sucesso!' });
    } catch (error) {
        res.status(500).json({ message: 'Erro no servidor.', error: error.message });
    }
});

// Rota para criar o primeiro usuário admin (apenas para inicialização)
// Esta rota deve ser removida ou protegida após a criação do primeiro admin
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
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword });
        await newUser.save();
        res.status(201).json({ message: 'Primeiro usuário admin criado com sucesso.' });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao criar usuário admin.', error: error.message });
    }
});


// --- Rotas CRUD para Projetos (protegidas por autenticação) ---

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

// --- Rotas CRUD para Portfólio (protegidas por autenticação) ---

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

// --- Rotas para Links Sociais (protegidas por autenticação) ---

// Obter links sociais
router.get('/social-links', async (req, res) => {
    try {
        const socialLinks = await SocialLinks.findOne();
        if (!socialLinks) {
            // Se não houver links, cria um padrão
            const newSocialLinks = new SocialLinks();
            await newSocialLinks.save();
            return res.json(newSocialLinks);
        }
        res.json(socialLinks);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar links sociais.', error: error.message });
    }
});

// Atualizar links sociais
router.put('/social-links', authenticateToken, async (req, res) => {
    try {
        let socialLinks = await SocialLinks.findOne();
        if (!socialLinks) {
            socialLinks = new SocialLinks();
        }
        socialLinks.instagram = req.body.instagram || '';
        socialLinks.facebook = req.body.facebook || '';
        socialLinks.spotify = req.body.spotify || '';
        socialLinks.youtube = req.body.youtube || '';
        await socialLinks.save();
        res.json({ message: 'Links sociais atualizados com sucesso!', socialLinks });
    } catch (error) {
        res.status(400).json({ message: 'Erro ao atualizar links sociais.', error: error.message });
    }
});

// --- NOVAS ROTAS PARA DEPOIMENTOS ---

// Rota para submeter um novo depoimento (público)
router.post('/testimonials', async (req, res) => {
    try {
        const { name, rating, comment } = req.body;
        if (!name || !rating || !comment) {
            return res.status(400).json({ message: 'Nome, avaliação e depoimento são obrigatórios.' });
        }
        const newTestimonial = new Testimonial({ name, rating, comment, approved: false }); // Começa como não aprovado
        await newTestimonial.save();
        res.status(201).json({ message: 'Depoimento enviado com sucesso para revisão!', testimonial: newTestimonial });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao enviar depoimento.', error: error.message });
    }
});

// Rota para obter depoimentos APROVADOS (público)
router.get('/testimonials', async (req, res) => {
    try {
        const approvedTestimonials = await Testimonial.find({ approved: true }).sort({ createdAt: -1 }); // Ordena pelos mais recentes
        res.json(approvedTestimonials);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar depoimentos aprovados.', error: error.message });
    }
});

// Rota para obter TODOS os depoimentos (admin-only)
router.get('/testimonials/all', authenticateToken, async (req, res) => {
    try {
        const allTestimonials = await Testimonial.find({}).sort({ createdAt: -1 }); // Ordena pelos mais recentes
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


app.use('/.netlify/functions/api', router); // Prefixo para as rotas da Netlify Function

module.exports.handler = serverless(app);
