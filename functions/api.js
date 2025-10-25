// functions/api.js - CORRIGIDO PARA SERVERLESS

const express = require('express');
const serverless = require('serverless-http');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const router = express.Router();

// ---------------------------------------------------
// 1. OTIMIZAÇÃO DA CONEXÃO MONGODB PARA SERVERLESS
// ---------------------------------------------------

let isConnected = false;

const connectToDatabase = async () => {
    // Retorna se a conexão já estiver estabelecida
    if (isConnected) {
        return;
    }

    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            // As opções deprecated (useNewUrlParser, useUnifiedTopology) foram removidas.
            // Se o Mongoose for antigo, você pode precisar adicioná-las.
        });
        isConnected = true;
        console.log('MongoDB conectado com sucesso (Serverless).');
    } catch (err) {
        console.error('Erro de conexão com MongoDB (Serverless):', err);
    }
};

// ---------------------------------------------------
// 2. IMPORTAÇÃO DOS MODELOS (A CHAVE DA CORREÇÃO)
// Removemos a definição de todos os Schemas daqui para evitar o erro de recompilação.
// Certifique-se de que os caminhos e nomes dos modelos estão corretos.
// ---------------------------------------------------

// Importe os modelos que você já corrigiu:
const User = require('../models/user'); 
const Project = require('../models/project');
const PortfolioItem = require('../models/portfolio');
const SocialLinks = require('../models/sociallinks');

// Importe os modelos que você PRECISA criar/corrigir:



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
// O uso de 'User.findOne' e 'bcrypt.compare' permanece.
// ---------------------------------------------------

// Rota de Login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ message: 'Credenciais inválidas.' });
        }

        // Se você adicionou 'comparePassword' ao seu user.js, use-o:
        // const isMatch = await user.comparePassword(password);
        // Senão, mantenha a comparação direta:
        const isMatch = await bcrypt.compare(password, user.password);
        
        if (!isMatch) {
            return res.status(400).json({ message: 'Credenciais inválidas.' });
        }

        const token = jwt.sign({ id: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '8h' });
        res.json({ message: 'Login bem-sucedido!', token });
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ message: 'Erro interno do servidor.', error: error.message });
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
        
        // Mantido bcrypt.compare como estava no original
        const isMatch = await bcrypt.compare(oldPassword, user.password); 
        if (!isMatch) {
            return res.status(400).json({ message: 'Senha antiga incorreta.' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ message: 'A nova senha deve ter no mínimo 6 caracteres.' });
        }

        // O hash é feito aqui, como estava no seu código original
        user.password = await bcrypt.hash(newPassword, 10); 
        await user.save();
        res.json({ message: 'Senha alterada com sucesso!' });
    } catch (error) {
        console.error('Erro ao alterar senha:', error);
        res.status(500).json({ message: 'Erro interno do servidor.', error: error.message });
    }
});

// Rota para criar o primeiro usuário admin
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
        console.error('Erro ao criar usuário admin:', error);
        res.status(500).json({ message: 'Erro ao criar usuário admin.', error: error.message });
    }
});


// ---------------------------------------------------
// 5. ROTAS CRUD PARA PROJETOS
// ---------------------------------------------------

// Obter todos os projetos (público)
router.get('/projects', async (req, res) => {
    try {
        const projects = await Project.find({}).sort({ createdAt: -1 });
        res.json(projects);
    } catch (error) {
        console.error('Erro ao buscar projetos:', error);
        res.status(500).json({ message: 'Erro ao buscar projetos.', error: error.message });
    }
});

// Adicionar novo projeto (admin-only)
router.post('/projects', authenticateToken, async (req, res) => {
    try {
        const newProject = new Project(req.body);
        await newProject.save();
        res.status(201).json({ message: 'Projeto adicionado com sucesso!', project: newProject });
    } catch (error) {
        console.error('Erro ao adicionar projeto:', error);
        res.status(400).json({ message: 'Erro ao adicionar projeto.', error: error.message });
    }
});

// Atualizar projeto por ID (admin-only)
router.put('/projects/:id', authenticateToken, async (req, res) => {
    try {
        const updatedProject = await Project.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!updatedProject) {
            return res.status(404).json({ message: 'Projeto não encontrado.' });
        }
        res.json({ message: 'Projeto atualizado com sucesso!', project: updatedProject });
    } catch (error) {
        console.error('Erro ao atualizar projeto:', error);
        res.status(400).json({ message: 'Erro ao atualizar projeto.', error: error.message });
    }
});

// Excluir projeto por ID (admin-only)
router.delete('/projects/:id', authenticateToken, async (req, res) => {
    try {
        const deletedProject = await Project.findByIdAndDelete(req.params.id);
        if (!deletedProject) {
            return res.status(404).json({ message: 'Projeto não encontrado.' });
        }
        res.status(204).send();
    } catch (error) {
        console.error('Erro ao excluir projeto:', error);
        res.status(500).json({ message: 'Erro ao excluir projeto.', error: error.message });
    }
});

// ---------------------------------------------------
// 6. ROTAS CRUD PARA PORTFÓLIO
// ---------------------------------------------------

// Obter todos os itens de portfólio (público)
router.get('/portfolio', async (req, res) => {
    try {
        const portfolioItems = await PortfolioItem.find({}).sort({ createdAt: -1 });
        res.json(portfolioItems);
    } catch (error) {
        console.error('Erro ao buscar itens de portfólio:', error);
        res.status(500).json({ message: 'Erro ao buscar itens de portfólio.', error: error.message });
    }
});

// Adicionar novo item de portfólio (admin-only)
router.post('/portfolio', authenticateToken, async (req, res) => {
    try {
        const newItem = new PortfolioItem(req.body);
        await newItem.save();
        res.status(201).json({ message: 'Item de portfólio adicionado com sucesso!', item: newItem });
    } catch (error) {
        console.error('Erro ao adicionar item de portfólio:', error);
        res.status(400).json({ message: 'Erro ao adicionar item de portfólio.', error: error.message });
    }
});

// Atualizar item de portfólio por ID (admin-only)
router.put('/portfolio/:id', authenticateToken, async (req, res) => {
    try {
        const updatedItem = await PortfolioItem.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!updatedItem) {
            return res.status(404).json({ message: 'Item de portfólio não encontrado.' });
        }
        res.json({ message: 'Item de portfólio atualizado com sucesso!', item: updatedItem });
    } catch (error) {
        console.error('Erro ao atualizar item de portfólio:', error);
        res.status(400).json({ message: 'Erro ao atualizar item de portfólio.', error: error.message });
    }
});

// Excluir item de portfólio por ID (admin-only)
router.delete('/portfolio/:id', authenticateToken, async (req, res) => {
    try {
        const deletedItem = await PortfolioItem.findByIdAndDelete(req.params.id);
        if (!deletedItem) {
            return res.status(404).json({ message: 'Item de portfólio não encontrado.' });
        }
        res.status(204).send();
    } catch (error) {
        console.error('Erro ao excluir item de portfólio:', error);
        res.status(500).json({ message: 'Erro ao excluir item de portfólio.', error: error.message });
    }
});

// ---------------------------------------------------
// 7. ROTAS PARA LINKS SOCIAIS
// ---------------------------------------------------

// Obter links sociais (público)
router.get('/social-links', async (req, res) => {
    try {
        let socialLinks = await SocialLinks.findOne();
        if (!socialLinks) {
            socialLinks = new SocialLinks();
            await socialLinks.save();
        }
        res.json(socialLinks);
    } catch (error) {
        console.error('Erro ao buscar links sociais:', error);
        res.status(500).json({ message: 'Erro ao buscar links sociais.', error: error.message });
    }
});

// Atualizar links sociais (admin-only)
router.put('/social-links', authenticateToken, async (req, res) => {
    try {
        const socialLinks = await SocialLinks.findOneAndUpdate({}, req.body, { new: true, upsert: true, runValidators: true });
        res.json({ message: 'Links sociais atualizados com sucesso!', socialLinks });
    } catch (error) {
        console.error('Erro ao atualizar links sociais:', error);
        res.status(400).json({ message: 'Erro ao atualizar links sociais.', error: error.message });
    }
});

// ---------------------------------------------------
// 8. ROTAS PARA DEPOIMENTOS
// ---------------------------------------------------

// Rota para submeter um novo depoimento (público)
router.post('/testimonials', async (req, res) => {
    try {
        const { name, rating, comment } = req.body;
        if (!name || !rating || !comment) {
            return res.status(400).json({ message: 'Nome, avaliação e depoimento são obrigatórios.' });
        }
        const newTestimonial = new Testimonial({ name, rating, comment, approved: false });
        await newTestimonial.save();
        res.status(201).json({ message: 'Depoimento enviado com sucesso para revisão!', testimonial: newTestimonial });
    } catch (error) {
        console.error('Erro ao enviar depoimento:', error);
        res.status(500).json({ message: 'Erro ao enviar depoimento.', error: error.message });
    }
});

// Rota para obter depoimentos APROVADOS (público)
router.get('/testimonials', async (req, res) => {
    try {
        const approvedTestimonials = await Testimonial.find({ approved: true }).sort({ createdAt: -1 });
        res.json(approvedTestimonials);
    } catch (error) {
        console.error('Erro ao buscar depoimentos aprovados:', error);
        res.status(500).json({ message: 'Erro ao buscar depoimentos aprovados.', error: error.message });
    }
});

// Rota para obter TODOS os depoimentos (admin-only)
router.get('/testimonials/all', authenticateToken, async (req, res) => {
    try {
        const allTestimonials = await Testimonial.find({}).sort({ createdAt: -1 });
        res.json(allTestimonials);
    } catch (error) {
        console.error('Erro ao buscar todos os depoimentos (admin):', error);
        res.status(500).json({ message: 'Erro ao buscar todos os depoimentos.', error: error.message });
    }
});

// Rota para obter um único depoimento por ID (admin-only ou para edição)
router.get('/testimonials/:id', authenticateToken, async (req, res) => {
    try {
        const testimonial = await Testimonial.findById(req.params.id);
        if (!testimonial) {
            return res.status(404).json({ message: 'Depoimento não encontrado.' });
        }
        res.json(testimonial);
    } catch (error) {
        console.error('Erro ao buscar depoimento por ID:', error);
        res.status(500).json({ message: 'Erro ao buscar depoimento.', error: error.message });
    }
});

// Rota para atualizar um depoimento (admin-only)
router.put('/testimonials/:id', authenticateToken, async (req, res) => {
    try {
        const updatedTestimonial = await Testimonial.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );
        if (!updatedTestimonial) {
            return res.status(404).json({ message: 'Depoimento não encontrado.' });
        }
        res.json({ message: 'Depoimento atualizado com sucesso!', testimonial: updatedTestimonial });
    } catch (error) {
        console.error('Erro ao atualizar depoimento:', error);
        res.status(400).json({ message: 'Erro ao atualizar depoimento.', error: error.message });
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
        console.error('Erro ao aprovar depoimento:', error);
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
        res.status(204).send();
    } catch (error) {
        console.error('Erro ao excluir depoimento:', error);
        res.status(500).json({ message: 'Erro ao excluir depoimento.', error: error.message });
    }
});

// ---------------------------------------------------
// 9. ROTAS PARA MÚSICAS SPOTIFY
// ---------------------------------------------------

// Rota para adicionar uma nova música Spotify (admin-only)
router.post('/spotify-tracks', authenticateToken, async (req, res) => {
    try {
        const { title, artist, spotifyId, image_url } = req.body;
        if (!title || !artist || !spotifyId) {
            return res.status(400).json({ message: 'Título, artista e ID do Spotify são obrigatórios.' });
        }
        const newTrack = new SpotifyTrack({ title, artist, spotifyId, image_url });
        await newTrack.save();
        res.status(201).json({ message: 'Música Spotify adicionada com sucesso!', track: newTrack });
    } catch (error) {
        console.error('Erro ao adicionar música Spotify:', error);
        if (error.code === 11000) {
            return res.status(409).json({ message: 'Esta música do Spotify (ID) já existe.' });
        }
        res.status(500).json({ message: 'Erro ao adicionar música Spotify.', error: error.message });
    }
});

// Rota para obter todas as músicas Spotify (público)
router.get('/spotify-tracks', async (req, res) => {
    try {
        const tracks = await SpotifyTrack.find({}).sort({ createdAt: -1 });
        res.json(tracks);
    } catch (error) {
        console.error('Erro ao buscar músicas Spotify:', error);
        res.status(500).json({ message: 'Erro ao buscar músicas Spotify.', error: error.message });
    }
});

// Rota para obter uma única música Spotify por ID (admin-only ou para edição)
router.get('/spotify-tracks/:id', authenticateToken, async (req, res) => {
    try {
        const track = await SpotifyTrack.findById(req.params.id);
        if (!track) {
            return res.status(404).json({ message: 'Música Spotify não encontrada.' });
        }
        res.json(track);
    } catch (error) {
        console.error('Erro ao buscar música Spotify por ID:', error);
        res.status(500).json({ message: 'Erro ao buscar música Spotify.', error: error.message });
    }
});

// Rota para atualizar uma música Spotify por ID (admin-only)
router.put('/spotify-tracks/:id', authenticateToken, async (req, res) => {
    try {
        const { title, artist, spotifyId, image_url } = req.body;
        const updatedTrack = await SpotifyTrack.findByIdAndUpdate(
            req.params.id,
            { title, artist, spotifyId, image_url },
            { new: true, runValidators: true }
        );
        if (!updatedTrack) {
            return res.status(404).json({ message: 'Música Spotify não encontrada.' });
        }
        res.json({ message: 'Música Spotify atualizada com sucesso!', track: updatedTrack });
    } catch (error) {
        console.error('Erro ao atualizar música Spotify:', error);
        if (error.code === 11000) {
            return res.status(409).json({ message: 'Este ID do Spotify já está sendo usado por outra música.' });
        }
        res.status(400).json({ message: 'Erro ao atualizar música Spotify.', error: error.message });
    }
});

// Rota para excluir uma música Spotify por ID (admin-only)
router.delete('/spotify-tracks/:id', authenticateToken, async (req, res) => {
    try {
        const deletedTrack = await SpotifyTrack.findByIdAndDelete(req.params.id);
        if (!deletedTrack) {
            return res.status(404).json({ message: 'Música Spotify não encontrada.' });
        }
        res.status(204).send();
    } catch (error) {
        console.error('Erro ao excluir música Spotify:', error);
        res.status(500).json({ message: 'Erro ao excluir música Spotify.', error: error.message });
    }
});

// ---------------------------------------------------
// 10. ROTAS PARA BLOG POSTS
// ---------------------------------------------------

// Rota para adicionar um novo post de blog (admin-only)
router.post('/blog-posts', authenticateToken, async (req, res) => {
    try {
        const { title, content, author, image_url, approved } = req.body;
        if (!title || !content || !author) {
            return res.status(400).json({ message: 'Título, conteúdo e autor são obrigatórios para o post do blog.' });
        }
        const newPost = new BlogPost({ title, content, author, image_url, approved });
        await newPost.save();
        res.status(201).json({ message: 'Post de blog adicionado com sucesso!', post: newPost });
    } catch (error) {
        console.error('Erro ao adicionar post de blog:', error);
        res.status(500).json({ message: 'Erro ao adicionar post de blog.', error: error.message });
    }
});

// Rota para obter todos os posts de blog APROVADOS (público)
router.get('/blog-posts', async (req, res) => {
    try {
        const approvedPosts = await BlogPost.find({ approved: true }).sort({ createdAt: -1 });
        res.json(approvedPosts);
    } catch (error) {
        console.error('Erro ao buscar posts de blog aprovados:', error);
        res.status(500).json({ message: 'Erro ao buscar posts de blog aprovados.', error: error.message });
    }
});

// Rota para obter TODOS os posts de blog (admin-only)
router.get('/blog-posts/all', authenticateToken, async (req, res) => {
    try {
        const allPosts = await BlogPost.find({}).sort({ createdAt: -1 });
        res.json(allPosts);
    } catch (error) {
        console.error('Erro ao buscar todos os posts de blog (admin):', error);
        res.status(500).json({ message: 'Erro ao buscar todos os posts de blog.', error: error.message });
    }
});

// Rota para obter um único post de blog por ID (público)
router.get('/blog-posts/:id', async (req, res) => {
    try {
        const post = await BlogPost.findById(req.params.id);
        if (!post) {
            return res.status(404).json({ message: 'Post de blog não encontrado.' });
        }
        res.json(post);
    } catch (error) {
        console.error('Erro ao buscar post de blog por ID:', error);
        res.status(500).json({ message: 'Erro ao buscar post de blog.', error: error.message });
    }
});

// Rota para atualizar um post de blog por ID (admin-only)
router.put('/blog-posts/:id', authenticateToken, async (req, res) => {
    try {
        const updatedPost = await BlogPost.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!updatedPost) {
            return res.status(404).json({ message: 'Post de blog não encontrado.' });
        }
        res.json({ message: 'Post de blog atualizado com sucesso!', post: updatedPost });
    } catch (error) {
        console.error('Erro ao atualizar post de blog:', error);
        res.status(400).json({ message: 'Erro ao atualizar post de blog.', error: error.message });
    }
});

// Rota para excluir um post de blog por ID (admin-only)
router.delete('/blog-posts/:id', authenticateToken, async (req, res) => {
    try {
        const deletedPost = await BlogPost.findByIdAndDelete(req.params.id);
        if (!deletedPost) {
            return res.status(404).json({ message: 'Post de blog não encontrado.' });
        }
        res.status(204).send();
    } catch (error) {
        console.error('Erro ao excluir post de blog:', error);
        res.status(500).json({ message: 'Erro ao excluir post de blog.', error: error.message });
    }
});

// ---------------------------------------------------
// 11. ROTAS PARA DOWNLOADABLE ITEMS
// ---------------------------------------------------

// Rota para adicionar um novo item de download (admin-only)
router.post('/downloadable-items', authenticateToken, async (req, res) => {
    try {
        const { title, description, type, download_url, image_url } = req.body;
        if (!title || !description || !type || !download_url) {
            return res.status(400).json({ message: 'Título, descrição, tipo e URL de download são obrigatórios para o item.' });
        }
        const newItem = new DownloadableItem({ title, description, type, download_url, image_url });
        await newItem.save();
        res.status(201).json({ message: 'Item de download adicionado com sucesso!', item: newItem });
    } catch (error) {
        console.error('Erro ao adicionar item de download:', error);
        res.status(500).json({ message: 'Erro ao adicionar item de download.', error: error.message });
    }
});

// Rota para obter todos os itens de download (público)
router.get('/downloadable-items', async (req, res) => {
    try {
        const items = await DownloadableItem.find({}).sort({ createdAt: -1 });
        res.json(items);
    } catch (error) {
        console.error('Erro ao buscar itens de download:', error);
        res.status(500).json({ message: 'Erro ao buscar itens de download.', error: error.message });
    }
});

// Rota para obter um único item de download por ID (público)
router.get('/downloadable-items/:id', async (req, res) => {
    try {
        const item = await DownloadableItem.findById(req.params.id);
        if (!item) {
            return res.status(404).json({ message: 'Item de download não encontrado.' });
        }
        res.json(item);
    } catch (error) {
        console.error('Erro ao buscar item de download por ID:', error);
        res.status(500).json({ message: 'Erro ao buscar item de download.', error: error.message });
    }
});

// Rota para atualizar um item de download por ID (admin-only)
router.put('/downloadable-items/:id', authenticateToken, async (req, res) => {
    try {
        const updatedItem = await DownloadableItem.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!updatedItem) {
            return res.status(404).json({ message: 'Item de download não encontrado.' });
        }
        res.json({ message: 'Item de download atualizado com sucesso!', item: updatedItem });
    } catch (error) {
        console.error('Erro ao atualizar item de download:', error);
        res.status(400).json({ message: 'Erro ao atualizar item de download.', error: error.message });
    }
});

// Rota para excluir um item de download por ID (admin-only)
router.delete('/downloadable-items/:id', authenticateToken, async (req, res) => {
    try {
        const deletedItem = await DownloadableItem.findByIdAndDelete(req.params.id);
        if (!deletedItem) {
            return res.status(404).json({ message: 'Item de download não encontrado.' });
        }
        res.status(204).send();
    } catch (error) {
        console.error('Erro ao excluir item de download:', error);
        res.status(500).json({ message: 'Erro ao excluir item de download.', error: error.message });
    }
});

// ---------------------------------------------------
// 12. ROTAS PARA CONFIGURAÇÃO DO VÍDEO DO ESTÚDIO
// ---------------------------------------------------

// Rota para obter a configuração do vídeo do estúdio (público)
router.get('/studio-config', async (req, res) => {
    try {
        let studioConfig = await StudioConfig.findOne();
        if (!studioConfig) {
            studioConfig = new StudioConfig({ youtubeVideoId: 'dQw4w9WgXcQ' });
            await studioConfig.save();
        }
        res.json(studioConfig);
    } catch (error) {
        console.error('Erro ao buscar configuração do estúdio:', error);
        res.status(500).json({ message: 'Erro ao buscar configuração do estúdio.', error: error.message });
    }
});

// Rota para atualizar a configuração do vídeo do estúdio (admin-only)
router.put('/studio-config', authenticateToken, async (req, res) => {
    try {
        const { youtubeVideoId } = req.body;
        if (typeof youtubeVideoId === 'undefined') {
            return res.status(400).json({ message: 'O ID do vídeo do YouTube é obrigatório.' });
        }
        const studioConfig = await StudioConfig.findOneAndUpdate(
            {}, 
            { youtubeVideoId }, 
            { new: true, upsert: true, runValidators: true }
        );
        res.json({ message: 'Configuração do vídeo do estúdio atualizada com sucesso!', studioConfig });
    } catch (error) {
        console.error('Erro ao atualizar configuração do estúdio:', error);
        res.status(400).json({ message: 'Erro ao atualizar configuração do estúdio.', error: error.message });
    }
});

// ---------------------------------------------------
// 13. EXPORTAÇÃO DO HANDLER
// ---------------------------------------------------

// Anexa todas as rotas ao app com o prefixo correto para Netlify Functions
app.use('/.netlify/functions/api', router);

// Exporta o handler para o Netlify Functions
module.exports.handler = serverless(app);