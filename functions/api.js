// functions/api.js

const express = require('express');
const serverless = require('serverless-http');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

// Carrega as variáveis de ambiente do arquivo .env
dotenv.config();

const app = express();
const router = express.Router();

// Middleware para parsear JSON no corpo das requisições
app.use(express.json());

// --- INÍCIO: Middleware CORS (Específico para seu domínio) ---
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', 'https://cbrecords.online'); // AGORA ESPECÍFICO!
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.status(200).send();
    }
    next();
});
// --- FIM: Middleware CORS ---

// Conexão com o MongoDB
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('MongoDB conectado com sucesso.'))
.catch(err => {
    console.error('Erro de conexão com MongoDB:', err);
});

// --- Schemas Mongoose (Mantenha todos os seus schemas aqui) ---
const UserSchema = new mongoose.Schema({ username: { type: String, required: true, unique: true, trim: true }, password: { type: String, required: true } });
const User = mongoose.model('User', UserSchema);
const ProjectSchema = new mongoose.Schema({ title: { type: String, required: true, trim: true }, description: { type: String, required: true, trim: true }, image_url: { type: String, trim: true }, spotify_link: { type: String, trim: true }, youtube_link: { type: String, trim: true }, createdAt: { type: Date, default: Date.now, index: true } });
const Project = mongoose.model('Project', ProjectSchema);
const PortfolioItemSchema = new mongoose.Schema({ title: { type: String, required: true, trim: true }, description: { type: String, required: true, trim: true }, image_url: { type: String, trim: true }, spotify_link: { type: String, trim: true }, youtube_link: { type: String, trim: true }, createdAt: { type: Date, default: Date.now, index: true } });
const PortfolioItem = mongoose.model('PortfolioItem', PortfolioItemSchema);
const SocialLinksSchema = new mongoose.Schema({ instagram: { type: String, default: '', trim: true }, facebook: { type: String, default: '', trim: true }, spotify: { type: String, default: '', trim: true }, youtube: { type: String, default: '', trim: true }, });
const SocialLinks = mongoose.model('SocialLinks', SocialLinksSchema);
const TestimonialSchema = new mongoose.Schema({ name: { type: String, required: true, trim: true }, rating: { type: Number, required: true, min: 1, max: 5 }, comment: { type: String, required: true, trim: true }, approved: { type: Boolean, default: false }, createdAt: { type: Date, default: Date.now, index: true } });
const Testimonial = mongoose.model('Testimonial', TestimonialSchema);
const SpotifyTrackSchema = new mongoose.Schema({ title: { type: String, required: true, trim: true }, artist: { type: String, required: true, trim: true }, spotifyId: { type: String, required: true, unique: true, trim: true }, image_url: { type: String, default: '', trim: true }, createdAt: { type: Date, default: Date.now, index: true } });
const SpotifyTrack = mongoose.model('SpotifyTrack', SpotifyTrackSchema);
const BlogPostSchema = new mongoose.Schema({ title: { type: String, required: true, trim: true }, content: { type: String, required: true, trim: true }, author: { type: String, required: true, trim: true }, image_url: { type: String, default: '', trim: true }, approved: { type: Boolean, default: false }, createdAt: { type: Date, default: Date.now, index: true } });
const BlogPost = mongoose.model('BlogPost', BlogPostSchema);
const DownloadableItemSchema = new mongoose.Schema({ title: { type: String, required: true, trim: true }, description: { type: String, required: true, trim: true }, type: { type: String, required: true, enum: ['pack', 'acapella', 'outro'], trim: true }, download_url: { type: String, required: true, trim: true }, image_url: { type: String, default: '', trim: true }, createdAt: { type: Date, default: Date.now, index: true } });
const DownloadableItem = mongoose.model('DownloadableItem', DownloadableItemSchema);
const StudioConfigSchema = new mongoose.Schema({ youtubeVideoId: { type: String, default: '', trim: true } });
const StudioConfig = mongoose.model('StudioConfig', StudioConfigSchema);


// --- Middleware de Autenticação ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        console.error('Autenticação falhou: Nenhum token fornecido.');
        return res.status(401).json({ message: 'Acesso negado. Token não fornecido.' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            console.error('Erro de verificação de token:', err);
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
router.post('/login', async (req, res) => { console.log('api.js: Rota POST /login acessada.'); const { username, password } = req.body; try { const user = await User.findOne({ username }); if (!user) return res.status(400).json({ message: 'Credenciais inválidas.' }); const isMatch = await bcrypt.compare(password, user.password); if (!isMatch) return res.status(400).json({ message: 'Credenciais inválidas.' }); const token = jwt.sign({ id: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '8h' }); res.json({ message: 'Login bem-sucedido!', token }); } catch (error) { console.error('Erro no login:', error); res.status(500).json({ message: 'Erro interno do servidor.', error: error.message }); } });
router.post('/change-password', authenticateToken, async (req, res) => { console.log('api.js: Rota POST /change-password acessada.'); const { oldPassword, newPassword } = req.body; try { const user = await User.findById(req.user.id); if (!user) return res.status(404).json({ message: 'Usuário não encontrado.' }); const isMatch = await bcrypt.compare(oldPassword, user.password); if (!isMatch) return res.status(400).json({ message: 'Senha antiga incorreta.' }); if (newPassword.length < 6) return res.status(400).json({ message: 'A nova senha deve ter no mínimo 6 caracteres.' }); user.password = await bcrypt.hash(newPassword, 10); await user.save(); res.json({ message: 'Senha alterada com sucesso!' }); } catch (error) { console.error('Erro ao alterar senha:', error); res.status(500).json({ message: 'Erro interno do servidor.', error: error.message }); } });
router.post('/create-first-admin', async (req, res) => { console.log('api.js: Rota POST /create-first-admin acessada.'); const { username, password } = req.body; if (!username || !password) return res.status(400).json({ message: 'Nome de usuário e senha são obrigatórios.' }); try { const existingUser = await User.findOne({ username }); if (existingUser) return res.status(409).json({ message: 'Usuário já existe.' }); const hashedPassword = await bcrypt.hash(password, 10); const newUser = new User({ username, password: hashedPassword }); await newUser.save(); res.status(201).json({ message: 'Primeiro usuário admin criado com sucesso.' }); } catch (error) { console.error('Erro ao criar usuário admin:', error); res.status(500).json({ message: 'Erro ao criar usuário admin.', error: error.message }); } });

// --- Rotas CRUD para Projetos ---
router.get('/projects', async (req, res) => { console.log('api.js: Rota GET /projects acessada.'); try { const projects = await Project.find({}).sort({ createdAt: -1 }); res.json(projects); } catch (error) { console.error('Erro ao buscar projetos:', error); res.status(500).json({ message: 'Erro ao buscar projetos.', error: error.message }); } });
router.post('/projects', authenticateToken, async (req, res) => { console.log('api.js: Rota POST /projects acessada.'); try { const newProject = new Project(req.body); await newProject.save(); res.status(201).json({ message: 'Projeto adicionado com sucesso!', project: newProject }); } catch (error) { console.error('Erro ao adicionar projeto:', error); res.status(400).json({ message: 'Erro ao adicionar projeto.', error: error.message }); } });
router.put('/projects/:id', authenticateToken, async (req, res) => { console.log('api.js: Rota PUT /projects/:id acessada.'); try { const updatedProject = await Project.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }); if (!updatedProject) return res.status(404).json({ message: 'Projeto não encontrado.' }); res.json({ message: 'Projeto atualizado com sucesso!', project: updatedProject }); } catch (error) { console.error('Erro ao atualizar projeto:', error); res.status(400).json({ message: 'Erro ao atualizar projeto.', error: error.message }); } });
router.delete('/projects/:id', authenticateToken, async (req, res) => { console.log('api.js: Rota DELETE /projects/:id acessada.'); try { const deletedProject = await Project.findByIdAndDelete(req.params.id); if (!deletedProject) return res.status(404).json({ message: 'Projeto não encontrado.' }); res.status(204).send(); } catch (error) { console.error('Erro ao excluir projeto:', error); res.status(500).json({ message: 'Erro ao excluir projeto.', error: error.message }); } });

// --- Rotas CRUD para Portfólio ---
router.get('/portfolio', async (req, res) => { console.log('api.js: Rota GET /portfolio acessada.'); try { const portfolioItems = await PortfolioItem.find({}).sort({ createdAt: -1 }); res.json(portfolioItems); } catch (error) { console.error('Erro ao buscar itens de portfólio:', error); res.status(500).json({ message: 'Erro ao buscar itens de portfólio.', error: error.message }); } });
router.post('/portfolio', authenticateToken, async (req, res) => { console.log('api.js: Rota POST /portfolio acessada.'); try { const newItem = new PortfolioItem(req.body); await newItem.save(); res.status(201).json({ message: 'Item de portfólio adicionado com sucesso!', item: newItem }); } catch (error) { console.error('Erro ao adicionar item de portfólio:', error); res.status(400).json({ message: 'Erro ao adicionar item de portfólio.', error: error.message }); } });
router.put('/portfolio/:id', authenticateToken, async (req, res) => { console.log('api.js: Rota PUT /portfolio/:id acessada.'); try { const updatedItem = await PortfolioItem.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }); if (!updatedItem) return res.status(404).json({ message: 'Item de portfólio não encontrado.' }); res.json({ message: 'Item de portfólio atualizado com sucesso!', item: updatedItem }); } catch (error) { console.error('Erro ao atualizar item de portfólio:', error); res.status(400).json({ message: 'Erro ao atualizar item de portfólio.', error: error.message }); } });
router.delete('/portfolio/:id', authenticateToken, async (req, res) => { console.log('api.js: Rota DELETE /portfolio/:id acessada.'); try { const deletedItem = await PortfolioItem.findByIdAndDelete(req.params.id); if (!deletedItem) return res.status(404).json({ message: 'Item de portfólio não encontrado.' }); res.status(204).send(); } catch (error) { console.error('Erro ao excluir item de portfólio:', error); res.status(500).json({ message: 'Erro ao excluir item de portfólio.', error: error.message }); } });

// --- Rotas para Links Sociais ---
router.get('/social-links', async (req, res) => { console.log('api.js: Rota GET /social-links acessada.'); try { let socialLinks = await SocialLinks.findOne(); if (!socialLinks) { socialLinks = new SocialLinks(); await socialLinks.save(); } res.json(socialLinks); } catch (error) { console.error('Erro ao buscar links sociais:', error); res.status(500).json({ message: 'Erro ao buscar links sociais.', error: error.message }); } });
router.put('/social-links', authenticateToken, async (req, res) => { console.log('api.js: Rota PUT /social-links acessada.'); try { const socialLinks = await SocialLinks.findOneAndUpdate({}, req.body, { new: true, upsert: true, runValidators: true }); res.json({ message: 'Links sociais atualizados com sucesso!', socialLinks }); } catch (error) { console.error('Erro ao atualizar links sociais:', error); res.status(400).json({ message: 'Erro ao atualizar links sociais.', error: error.message }); } });

// --- Rotas para Depoimentos ---
router.post('/testimonials', async (req, res) => { console.log('api.js: Rota POST /testimonials acessada.'); try { const { name, rating, comment } = req.body; if (!name || !rating || !comment) return res.status(400).json({ message: 'Nome, avaliação e depoimento são obrigatórios.' }); const newTestimonial = new Testimonial({ name, rating, comment, approved: false }); await newTestimonial.save(); res.status(201).json({ message: 'Depoimento enviado com sucesso para revisão!', testimonial: newTestimonial }); } catch (error) { console.error('Erro ao enviar depoimento:', error); res.status(500).json({ message: 'Erro ao enviar depoimento.', error: error.message }); } });
router.get('/testimonials', async (req, res) => { console.log('api.js: Rota GET /testimonials (aprovados) acessada.'); try { const approvedTestimonials = await Testimonial.find({ approved: true }).sort({ createdAt: -1 }); res.json(approvedTestimonials); } catch (error) { console.error('Erro ao buscar depoimentos aprovados:', error); res.status(500).json({ message: 'Erro ao buscar depoimentos aprovados.', error: error.message }); } });
router.get('/testimonials/all', authenticateToken, async (req, res) => { console.log('api.js: Rota GET /testimonials/all (admin) acessada.'); try { const allTestimonials = await Testimonial.find({}).sort({ createdAt: -1 }); res.json(allTestimonials); } catch (error) { console.error('Erro ao buscar todos os depoimentos (admin):', error); res.status(500).json({ message: 'Erro ao buscar todos os depoimentos.', error: error.message }); } });
router.get('/testimonials/:id', authenticateToken, async (req, res) => { console.log('api.js: Rota GET /testimonials/:id acessada.'); try { const testimonial = await Testimonial.findById(req.params.id); if (!testimonial) return res.status(404).json({ message: 'Depoimento não encontrado.' }); res.json(testimonial); } catch (error) { console.error('Erro ao buscar depoimento por ID:', error); res.status(500).json({ message: 'Erro ao buscar depoimento.', error: error.message }); } });
router.put('/testimonials/:id', authenticateToken, async (req, res) => { console.log('api.js: Rota PUT /testimonials/:id acessada.'); try { const updatedTestimonial = await Testimonial.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }); if (!updatedTestimonial) return res.status(404).json({ message: 'Depoimento não encontrado.' }); res.json({ message: 'Depoimento atualizado com sucesso!', testimonial: updatedTestimonial }); } catch (error) { console.error('Erro ao atualizar depoimento:', error); res.status(400).json({ message: 'Erro ao atualizar depoimento.', error: error.message }); } });
router.put('/testimonials/:id/approve', authenticateToken, async (req, res) => { console.log('api.js: Rota PUT /testimonials/:id/approve acessada.'); try { const updatedTestimonial = await Testimonial.findByIdAndUpdate(req.params.id, { approved: true }, { new: true }); if (!updatedTestimonial) return res.status(404).json({ message: 'Depoimento não encontrado.' }); res.json({ message: 'Depoimento aprovado com sucesso!', testimonial: updatedTestimonial }); } catch (error) { console.error('Erro ao aprovar depoimento:', error); res.status(400).json({ message: 'Erro ao aprovar depoimento.', error: error.message }); } });
router.delete('/testimonials/:id', authenticateToken, async (req, res) => { console.log('api.js: Rota DELETE /testimonials/:id acessada.'); try { const deletedTestimonial = await Testimonial.findByIdAndDelete(req.params.id); if (!deletedTestimonial) return res.status(404).json({ message: 'Depoimento não encontrado.' }); res.status(204).send(); } catch (error) { console.error('Erro ao excluir depoimento:', error); res.status(500).json({ message: 'Erro ao excluir depoimento.', error: error.message }); } });

// --- Rotas para Músicas Spotify ---
router.post('/spotify-tracks', authenticateToken, async (req, res) => { console.log('api.js: Rota POST /spotify-tracks acessada.'); try { const { title, artist, spotifyId, image_url } = req.body; if (!title || !artist || !spotifyId) return res.status(400).json({ message: 'Título, artista e ID do Spotify são obrigatórios.' }); const newTrack = new SpotifyTrack({ title, artist, spotifyId, image_url }); await newTrack.save(); res.status(201).json({ message: 'Música Spotify adicionada com sucesso!', track: newTrack }); } catch (error) { console.error('Erro ao adicionar música Spotify:', error); if (error.code === 11000) return res.status(409).json({ message: 'Esta música do Spotify (ID) já existe.' }); res.status(500).json({ message: 'Erro ao adicionar música Spotify.', error: error.message }); } });
router.get('/spotify-tracks', async (req, res) => { console.log('api.js: Rota GET /spotify-tracks acessada.'); try { const tracks = await SpotifyTrack.find({}).sort({ createdAt: -1 }); res.json(tracks); } catch (error) { console.error('Erro ao buscar músicas Spotify:', error); res.status(500).json({ message: 'Erro ao buscar músicas Spotify.', error: error.message }); } });
router.get('/spotify-tracks/:id', authenticateToken, async (req, res) => { console.log('api.js: Rota GET /spotify-tracks/:id acessada.'); try { const track = await SpotifyTrack.findById(req.params.id); if (!track) return res.status(404).json({ message: 'Música Spotify não encontrada.' }); res.json(track); } catch (error) { console.error('Erro ao buscar música Spotify por ID:', error); res.status(500).json({ message: 'Erro ao buscar música Spotify.', error: error.message }); } });
router.put('/spotify-tracks/:id', authenticateToken, async (req, res) => { console.log('api.js: Rota PUT /spotify-tracks/:id acessada.'); try { const { title, artist, spotifyId, image_url } = req.body; const updatedTrack = await SpotifyTrack.findByIdAndUpdate(req.params.id, { title, artist, spotifyId, image_url }, { new: true, runValidators: true }); if (!updatedTrack) return res.status(404).json({ message: 'Música Spotify não encontrada.' }); res.json({ message: 'Música Spotify atualizada com sucesso!', track: updatedTrack }); } catch (error) { console.error('Erro ao atualizar música Spotify:', error); if (error.code === 11000) return res.status(409).json({ message: 'Este ID do Spotify já está sendo usado por outra música.' }); res.status(400).json({ message: 'Erro ao atualizar música Spotify.', error: error.message }); } });
router.delete('/spotify-tracks/:id', authenticateToken, async (req, res) => { console.log('api.js: Rota DELETE /spotify-tracks/:id acessada.'); try { const deletedTrack = await SpotifyTrack.findByIdAndDelete(req.params.id); if (!deletedTrack) return res.status(404).json({ message: 'Música Spotify não encontrada.' }); res.status(204).send(); } catch (error) { console.error('Erro ao excluir música Spotify:', error); res.status(500).json({ message: 'Erro ao excluir música Spotify.', error: error.message }); } });

// --- Rotas para Blog Posts ---
router.post('/blog-posts', authenticateToken, async (req, res) => { console.log('api.js: Rota POST /blog-posts acessada.'); try { const { title, content, author, image_url, approved } = req.body; if (!title || !content || !author) return res.status(400).json({ message: 'Título, conteúdo e autor são obrigatórios para o post do blog.' }); const newPost = new BlogPost({ title, content, author, image_url, approved }); await newPost.save(); res.status(201).json({ message: 'Post de blog adicionado com sucesso!', post: newPost }); } catch (error) { console.error('Erro ao adicionar post de blog:', error); res.status(500).json({ message: 'Erro ao adicionar post de blog.', error: error.message }); } });
router.get('/blog-posts', async (req, res) => { console.log('api.js: Rota GET /blog-posts (aprovados) acessada.'); try { const approvedPosts = await BlogPost.find({ approved: true }).sort({ createdAt: -1 }); res.json(approvedPosts); } catch (error) { console.error('Erro ao buscar posts de blog aprovados:', error); res.status(500).json({ message: 'Erro ao buscar posts de blog aprovados.', error: error.message }); } });
router.get('/blog-posts/all', authenticateToken, async (req, res) => { console.log('api.js: Rota GET /blog-posts/all (admin) acessada.'); try { const allPosts = await BlogPost.find({}).sort({ createdAt: -1 }); res.json(allPosts); } catch (error) { console.error('Erro ao buscar todos os posts de blog (admin):', error); res.status(500).json({ message: 'Erro ao buscar todos os posts de blog.', error: error.message }); } });
router.get('/blog-posts/:id', async (req, res) => { console.log('api.js: Rota GET /blog-posts/:id acessada.'); try { const post = await BlogPost.findById(req.params.id); if (!post) return res.status(404).json({ message: 'Post de blog não encontrado.' }); res.json(post); } catch (error) { console.error('Erro ao buscar post de blog por ID:', error); res.status(500).json({ message: 'Erro ao buscar post de blog.', error: error.message }); } });
router.put('/blog-posts/:id', authenticateToken, async (req, res) => { console.log('api.js: Rota PUT /blog-posts/:id acessada.'); try { const updatedPost = await BlogPost.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }); if (!updatedPost) return res.status(404).json({ message: 'Post de blog não encontrado.' }); res.json({ message: 'Post de blog atualizado com sucesso!', post: updatedPost }); } catch (error) { console.error('Erro ao atualizar post de blog:', error); res.status(400).json({ message: 'Erro ao atualizar post de blog.', error: error.message }); } });
router.delete('/blog-posts/:id', authenticateToken, async (req, res) => { console.log('api.js: Rota DELETE /blog-posts/:id acessada.'); try { const deletedPost = await BlogPost.findByIdAndDelete(req.params.id); if (!deletedPost) return res.status(404).json({ message: 'Post de blog não encontrado.' }); res.status(204).send(); } catch (error) { console.error('Erro ao excluir post de blog:', error); res.status(500).json({ message: 'Erro ao excluir post de blog.', error: error.message }); } });

// --- Rotas para Packs e Acapellas (Downloadable Items) ---
router.post('/downloadable-items', authenticateToken, async (req, res) => { console.log('api.js: Rota POST /downloadable-items acessada.'); try { const { title, description, type, download_url, image_url } = req.body; if (!title || !description || !type || !download_url) return res.status(400).json({ message: 'Título, descrição, tipo e URL de download são obrigatórios para o item.' }); const newItem = new DownloadableItem({ title, description, type, download_url, image_url }); await newItem.save(); res.status(201).json({ message: 'Item de download adicionado com sucesso!', item: newItem }); } catch (error) { console.error('Erro ao adicionar item de download:', error); res.status(500).json({ message: 'Erro ao adicionar item de download.', error: error.message }); } });
router.get('/downloadable-items', async (req, res) => { console.log('api.js: Rota GET /downloadable-items acessada.'); try { const items = await DownloadableItem.find({}).sort({ createdAt: -1 }); res.json(items); } catch (error) { console.error('Erro ao buscar itens de download:', error); res.status(500).json({ message: 'Erro ao buscar itens de download.', error: error.message }); } });
router.get('/downloadable-items/:id', async (req, res) => { console.log('api.js: Rota GET /downloadable-items/:id acessada.'); try { const item = await DownloadableItem.findById(req.params.id); if (!item) return res.status(404).json({ message: 'Item de download não encontrado.' }); res.json(item); } catch (error) { console.error('Erro ao buscar item de download por ID:', error); res.status(500).json({ message: 'Erro ao buscar item de download.', error: error.message }); } });
router.put('/downloadable-items/:id', authenticateToken, async (req, res) => { console.log('api.js: Rota PUT /downloadable-items/:id acessada.'); try { const updatedItem = await DownloadableItem.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }); if (!updatedItem) return res.status(404).json({ message: 'Item de download não encontrado.' }); res.json({ message: 'Item de download atualizado com sucesso!', item: updatedItem }); } catch (error) { console.error('Erro ao atualizar item de download:', error); res.status(400).json({ message: 'Erro ao atualizar item de download.', error: error.message }); } });
router.delete('/downloadable-items/:id', authenticateToken, async (req, res) => { console.log('api.js: Rota DELETE /downloadable-items/:id acessada.'); try { const deletedItem = await DownloadableItem.findByIdAndDelete(req.params.id); if (!deletedItem) return res.status(404).json({ message: 'Item de download não encontrado.' }); res.status(204).send(); } catch (error) { console.error('Erro ao excluir item de download:', error); res.status(500).json({ message: 'Erro ao excluir item de download.', error: error.message }); } });

// --- NOVAS ROTAS PARA CONFIGURAÇÃO DO VÍDEO DO ESTÚDIO ---
router.get('/studio-config', async (req, res) => { console.log('api.js: Rota GET /studio-config acessada.'); try { let studioConfig = await StudioConfig.findOne(); if (!studioConfig) { studioConfig = new StudioConfig({ youtubeVideoId: 'dQw4w9WgXcQ' }); await studioConfig.save(); } res.json(studioConfig); } catch (error) { console.error('Erro ao buscar configuração do estúdio:', error); res.status(500).json({ message: 'Erro ao buscar configuração do estúdio.', error: error.message }); } });
router.put('/studio-config', authenticateToken, async (req, res) => { console.log('api.js: Rota PUT /studio-config acessada.'); try { const studioConfig = await StudioConfig.findOneAndUpdate({}, req.body, { new: true, upsert: true, runValidators: true }); res.json({ message: 'Configuração do vídeo do estúdio atualizada com sucesso!', studioConfig }); } catch (error) { console.error('Erro ao atualizar configuração do estúdio:', error); res.status(400).json({ message: 'Erro ao atualizar configuração do estúdio.', error: error.message }); } });

// Prefixo para as rotas da Netlify Function
// Todas as rotas serão acessíveis via /.netlify/functions/api/...
app.use('/.netlify/functions/api', router);

// Exporta o handler para o Netlify Functions
module.exports.handler = serverless(app, { basePath: '/.netlify/functions/api' });
