const express = require('express');
const serverless = require('serverless-http');
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const connectToDatabase = require('./utils/db');
const { JWT_SECRET, authenticateToken } = require('./utils/auth');

// Modelos Mongoose
const User = require('./models/user');
const Project = require('./models/Project');
const Portfolio = require('./models/portfolio');
const SocialLinks = require('./models/sociallinks');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Conexão com o banco de dados antes de cada requisição
app.use(async (req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (error) {
    console.error('Erro no middleware de conexão com o DB:', error);
    res.status(500).json({ message: 'Erro ao conectar ao banco de dados.', error: error.message });
  }
});

// --- Rotas de Autenticação ---
// Rota de login: removido '/api'
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ message: 'Usuário ou senha inválidos.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Usuário ou senha inválidos.' });
    }

    const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ message: 'Login bem-sucedido!', token });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ message: 'Erro no servidor durante o login.', error: error.message });
  }
});

// Rota de alteração de senha: removido '/api'
app.post('/change-password', authenticateToken, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const userId = req.user.id; // Obtido do token JWT

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Usuário não encontrado.' });
    }

    const isMatch = await user.comparePassword(oldPassword);
    if (!isMatch) {
      return res.status(400).json({ message: 'Senha antiga incorreta.' });
    }

    user.password = newPassword; // O hook pre-save irá fazer o hash
    await user.save();

    res.json({ message: 'Senha alterada com sucesso!' });
  } catch (error) {
    console.error('Erro ao alterar senha:', error);
    res.status(500).json({ message: 'Erro no servidor ao alterar senha.', error: error.message });
  }
});

// --- Rotas de Projetos (CRUD) ---
// Obter todos os projetos: removido '/api'
app.get('/projects', async (req, res) => {
  try {
    const projects = await Project.find().sort({ createdAt: -1 });
    res.json(projects);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar projetos.', error: error.message });
  }
});

// Adicionar novo projeto (protegido por autenticação): removido '/api'
app.post('/projects', authenticateToken, async (req, res) => {
  try {
    const newProject = new Project(req.body);
    await newProject.save();
    res.status(201).json({ message: 'Projeto adicionado com sucesso!', project: newProject });
  } catch (error) {
    console.error('Erro ao adicionar projeto:', error);
    res.status(500).json({ message: 'Erro ao adicionar projeto.', error: error.message });
  }
});

// Atualizar projeto por ID (protegido por autenticação): removido '/api'
app.put('/projects/:id', authenticateToken, async (req, res) => {
  try {
    const updatedProject = await Project.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updatedProject) {
      return res.status(404).json({ message: 'Projeto não encontrado.' });
    }
    res.json({ message: 'Projeto atualizado com sucesso!', project: updatedProject });
  } catch (error) {
    console.error('Erro ao atualizar projeto:', error);
    res.status(500).json({ message: 'Erro ao atualizar projeto.', error: error.message });
  }
});

// Deletar projeto por ID (protegido por autenticação): removido '/api'
app.delete('/projects/:id', authenticateToken, async (req, res) => {
  try {
    const deletedProject = await Project.findByIdAndDelete(req.params.id);
    if (!deletedProject) {
      return res.status(404).json({ message: 'Projeto não encontrado.' });
    }
    res.status(204).send(); // No content
  } catch (error) {
    console.error('Erro ao deletar projeto:', error);
    res.status(500).json({ message: 'Erro ao deletar projeto.', error: error.message });
  }
});

// --- Rotas de Portfólio (CRUD) ---
// Obter todos os itens do portfólio: removido '/api'
app.get('/portfolio', async (req, res) => {
  try {
    const portfolioItems = await Portfolio.find().sort({ createdAt: -1 });
    res.json(portfolioItems);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar itens do portfólio.', error: error.message });
  }
});

// Adicionar novo item de portfólio (protegido por autenticação): removido '/api'
app.post('/portfolio', authenticateToken, async (req, res) => {
  try {
    const newItem = new Portfolio(req.body);
    await newItem.save();
    res.status(201).json({ message: 'Item de portfólio adicionado com sucesso!', item: newItem });
  } catch (error) {
    console.error('Erro ao adicionar item de portfólio:', error);
    res.status(500).json({ message: 'Erro ao adicionar item de portfólio.', error: error.message });
  }
});

// Atualizar item de portfólio por ID (protegido por autenticação): removido '/api'
app.put('/portfolio/:id', authenticateToken, async (req, res) => {
  try {
    const updatedItem = await Portfolio.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updatedItem) {
      return res.status(404).json({ message: 'Item de portfólio não encontrado.' });
    }
    res.json({ message: 'Item de portfólio atualizado com sucesso!', item: updatedItem });
  } catch (error) {
    console.error('Erro ao atualizar item de portfólio:', error);
    res.status(500).json({ message: 'Erro ao atualizar item de portfólio.', error: error.message });
  }
});

// Deletar item de portfólio por ID (protegido por autenticação): removido '/api'
app.delete('/portfolio/:id', authenticateToken, async (req, res) => {
  try {
    const deletedItem = await Portfolio.findByIdAndDelete(req.params.id);
    if (!deletedItem) {
      return res.status(404).json({ message: 'Item de portfólio não encontrado.' });
    }
    res.status(204).send(); // No content
  } catch (error) {
    console.error('Erro ao deletar item de portfólio:', error);
    res.status(500).json({ message: 'Erro ao deletar item de portfólio.', error: error.message });
  }
});

// --- Rotas de Links Sociais ---
// Obter links sociais: removido '/api'
app.get('/social-links', async (req, res) => {
  try {
    let socialLinks = await SocialLinks.findOne();
    if (!socialLinks) {
      // Se não existir, crie um documento padrão
      socialLinks = await SocialLinks.create({});
    }
    res.json(socialLinks);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar links sociais.', error: error.message });
  }
});

// Atualizar links sociais (protegido por autenticação): removido '/api'
app.put('/social-links', authenticateToken, async (req, res) => {
  try {
    // Encontre e atualize o único documento de links sociais
    const updatedSocialLinks = await SocialLinks.findOneAndUpdate({}, req.body, { new: true, upsert: true });
    res.json({ message: 'Links sociais atualizados com sucesso!', socialLinks: updatedSocialLinks });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao atualizar links sociais.', error: error.message });
  }
});

// Exportar o manipulador serverless
module.exports.handler = serverless(app);
