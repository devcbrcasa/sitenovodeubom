# netlify/functions/api.py

import os
import json
from pymongo import MongoClient
from bson.objectid import ObjectId
from flask import Flask, request, jsonify, send_from_directory
from functools import wraps
import jwt
from datetime import datetime, timedelta
from werkzeug.utils import secure_filename

print("API: Iniciando a configuração do Flask...")
app = Flask(__name__)

# Configuração do MongoDB
MONGO_URI = os.environ.get('MONGODB_URI')
if not MONGO_URI:
    print("ERRO: MONGODB_URI não definida nas variáveis de ambiente.")
    raise ValueError("MONGODB_URI environment variable not set.")

print(f"API: MONGODB_URI carregada. Conectando ao MongoDB...")
client = MongoClient(MONGO_URI)
db = client.cbr_records # Substitua 'cbr_records' pelo nome do seu banco de dados

# Coleções do MongoDB
users_collection = db.users
projects_collection = db.projects
portfolio_collection = db.portfolio
testimonials_collection = db.testimonials
social_links_collection = db.social_links
spotify_tracks_collection = db.spotify_tracks
youtube_videos_collection = db.youtube_videos
files_collection = db.files
blog_posts_collection = db.blog_posts # NOVA COLEÇÃO PARA BLOG

# Chave secreta para JWT (deve ser a mesma usada no seu login admin)
JWT_SECRET = os.environ.get('JWT_SECRET')
if not JWT_SECRET:
    print("ERRO: JWT_SECRET não definida nas variáveis de ambiente.")
    raise ValueError("JWT_SECRET environment variable not set.")

ADMIN_USERNAME = os.environ.get('ADMIN_USERNAME')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD')

if not ADMIN_USERNAME or not ADMIN_PASSWORD:
    print("AVISO: ADMIN_USERNAME ou ADMIN_PASSWORD não definidos nas variáveis de ambiente. O login de admin pode falhar.")

# Diretório temporário para upload de arquivos no Netlify Function
# ATENÇÃO: Este diretório é APENAS TEMPORÁRIO e não persistirá entre as chamadas da função.
# Para armazenamento persistente, você precisará integrar um serviço de armazenamento em nuvem (AWS S3, Cloudinary, etc.).
UPLOAD_FOLDER = '/tmp' # Caminho comum para arquivos temporários em ambientes Linux/serverless
os.makedirs(UPLOAD_FOLDER, exist_ok=True) # Cria o diretório se não existir
print(f"API: Diretório de upload temporário configurado: {UPLOAD_FOLDER}")

# Tipos de arquivos permitidos para upload
ALLOWED_EXTENSIONS = {'mp3', 'wav', 'zip', 'rar', 'pdf', 'doc', 'docx'}

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

print("API: Configuração inicial concluída.")

# --- Middleware de Autenticação JWT ---
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        print("API: Verificando token JWT...")
        token = None
        if 'Authorization' in request.headers:
            token = request.headers['Authorization'].split(" ")[1]

        if not token:
            print("API: Token é necessário para esta ação!")
            return jsonify({'message': 'Token é necessário para esta ação!'}), 401
        
        try:
            data = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            if data.get('username') != 'admin':
                print(f"API: Permissão negada para o usuário: {data.get('username')}")
                return jsonify({'message': 'Permissão negada: Apenas administradores podem realizar esta ação.'}), 403
            print("API: Token JWT válido e autenticado como admin.")
        except jwt.ExpiredSignatureError:
            print("API: Token JWT expirado.")
            return jsonify({'message': 'Token expirado. Faça login novamente.'}), 401
        except jwt.InvalidTokenError:
            print("API: Token inválido. Faça login novamente.')")
            return jsonify({'message': 'Token inválido. Faça login novamente.'}), 401
        except Exception as e:
            print(f"API: Erro inesperado na autenticação JWT: {str(e)}")
            return jsonify({'message': f'Erro de autenticação: {str(e)}'}), 401

        return f(*args, **kwargs)
    return decorated

# --- Rotas de Autenticação ---
@app.route('/login', methods=['POST'])
def login():
    print("API: Recebida requisição POST para /login")
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    if username == ADMIN_USERNAME and password == ADMIN_PASSWORD:
        token = jwt.encode({
            'username': username,
            'exp': datetime.utcnow() + timedelta(hours=24) # Token válido por 24 horas
        }, JWT_SECRET, algorithm="HS256")
        print("API: Login bem-sucedido.")
        return jsonify({'message': 'Login bem-sucedido!', 'token': token}), 200
    print("API: Credenciais de login inválidas.")
    return jsonify({'message': 'Credenciais inválidas'}), 401

@app.route('/change-password', methods=['POST'])
@token_required
def change_password():
    print("API: Recebida requisição POST para /change-password")
    data = request.get_json()
    old_password = data.get('oldPassword')
    new_password = data.get('newPassword')

    if old_password == ADMIN_PASSWORD:
        os.environ['ADMIN_PASSWORD'] = new_password
        print("API: Senha alterada com sucesso (apenas para esta sessão).")
        return jsonify({'message': 'Senha alterada com sucesso! Lembre-se que em produção, isso precisaria ser persistido em um banco de dados.'}), 200
    print("API: Senha antiga incorreta.")
    return jsonify({'message': 'Senha antiga incorreta'}), 401

# --- Rotas de Projetos ---
@app.route('/projects', methods=['GET'])
def get_projects():
    print("API: Recebida requisição GET para /projects")
    try:
        projects = []
        for project in projects_collection.find():
            project['_id'] = str(project['_id'])
            projects.append(project)
        print(f"API: Retornando {len(projects)} projetos.")
        return jsonify(projects), 200
    except Exception as e:
        print(f"API: Erro ao buscar projetos: {e}")
        return jsonify({'message': 'Erro ao buscar projetos', 'error': str(e)}), 500

@app.route('/projects', methods=['POST'])
@token_required
def add_project():
    print("API: Recebida requisição POST para /projects")
    data = request.get_json()
    if not data or not all(k in data for k in ['title', 'description', 'spotify_link', 'youtube_link']):
        print("API: Dados inválidos para adicionar projeto.")
        return jsonify({'message': 'Dados inválidos. Campos necessários: title, description, spotify_link, youtube_link'}), 400
    try:
        result = projects_collection.insert_one(data)
        print(f"API: Projeto adicionado com sucesso! ID: {result.inserted_id}")
        return jsonify({'message': 'Projeto adicionado com sucesso!', 'id': str(result.inserted_id)}), 201
    except Exception as e:
        print(f"API: Erro ao adicionar projeto: {e}")
        return jsonify({'message': 'Erro ao adicionar projeto', 'error': str(e)}), 500

@app.route('/projects/<id>', methods=['PUT'])
@token_required
def update_project(id):
    print(f"API: Recebida requisição PUT para /projects/{id}")
    data = request.get_json()
    if not data:
        print("API: Nenhum dado fornecido para atualizar projeto.")
        return jsonify({'message': 'Nenhum dado fornecido para atualização'}), 400
    try:
        result = projects_collection.update_one({'_id': ObjectId(id)}, {'$set': data})
        if result.matched_count == 0:
            print(f"API: Projeto {id} não encontrado para atualização.")
            return jsonify({'message': 'Projeto não encontrado'}), 404
        print(f"API: Projeto {id} atualizado com sucesso!")
        return jsonify({'message': 'Projeto atualizado com sucesso!'}), 200
    except Exception as e:
        print(f"API: Erro ao atualizar projeto {id}: {e}")
        return jsonify({'message': 'Erro ao atualizar projeto', 'error': str(e)}), 500

@app.route('/projects/<id>', methods=['DELETE'])
@token_required
def delete_project(id):
    print(f"API: Recebida requisição DELETE para /projects/{id}")
    try:
        result = projects_collection.delete_one({'_id': ObjectId(id)})
        if result.deleted_count == 0:
            print(f"API: Projeto {id} não encontrado para exclusão.")
            return jsonify({'message': 'Projeto não encontrado'}), 404
        print(f"API: Projeto {id} excluído com sucesso!")
        return jsonify({'message': 'Projeto excluído com sucesso!'}), 204
    except Exception as e:
        print(f"API: Erro ao excluir projeto {id}: {e}")
        return jsonify({'message': 'Erro ao excluir projeto', 'error': str(e)}), 500

# --- Rotas de Portfólio ---
@app.route('/portfolio', methods=['GET'])
def get_portfolio():
    print("API: Recebida requisição GET para /portfolio")
    try:
        portfolio_items = []
        for item in portfolio_collection.find():
            item['_id'] = str(item['_id'])
            portfolio_items.append(item)
        print(f"API: Retornando {len(portfolio_items)} itens de portfólio.")
        return jsonify(portfolio_items), 200
    except Exception as e:
        print(f"API: Erro ao buscar itens do portfólio: {e}")
        return jsonify({'message': 'Erro ao buscar itens do portfólio', 'error': str(e)}), 500

@app.route('/portfolio', methods=['POST'])
@token_required
def add_portfolio_item():
    print("API: Recebida requisição POST para /portfolio")
    data = request.get_json()
    if not data or not all(k in data for k in ['title', 'description', 'spotify_link', 'youtube_link']):
        print("API: Dados inválidos para adicionar item de portfólio.")
        return jsonify({'message': 'Dados inválidos. Campos necessários: title, description, spotify_link, youtube_link'}), 400
    try:
        result = portfolio_collection.insert_one(data)
        print(f"API: Item de portfólio adicionado com sucesso! ID: {result.inserted_id}")
        return jsonify({'message': 'Item de portfólio adicionado com sucesso!', 'id': str(result.inserted_id)}), 201
    except Exception as e:
        print(f"API: Erro ao adicionar item de portfólio: {e}")
        return jsonify({'message': 'Erro ao adicionar item de portfólio', 'error': str(e)}), 500

@app.route('/portfolio/<id>', methods=['PUT'])
@token_required
def update_portfolio_item(id):
    print(f"API: Recebida requisição PUT para /portfolio/{id}")
    data = request.get_json()
    if not data:
        print("API: Nenhum dado fornecido para atualização de item de portfólio.")
        return jsonify({'message': 'Nenhum dado fornecido para atualização'}), 400
    try:
        result = portfolio_collection.update_one({'_id': ObjectId(id)}, {'$set': data})
        if result.matched_count == 0:
            print(f"API: Item de portfólio {id} não encontrado para atualização.")
            return jsonify({'message': 'Item de portfólio não encontrado'}), 404
        print(f"API: Item de portfólio {id} atualizado com sucesso!")
        return jsonify({'message': 'Item de portfólio atualizado com sucesso!'}), 200
    except Exception as e:
        print(f"API: Erro ao atualizar item de portfólio {id}: {e}")
        return jsonify({'message': 'Erro ao atualizar item de portfólio', 'error': str(e)}), 500

@app.route('/portfolio/<id>', methods=['DELETE'])
@token_required
def delete_portfolio_item(id):
    print(f"API: Recebida requisição DELETE para /portfolio/{id}")
    try:
        result = portfolio_collection.delete_one({'_id': ObjectId(id)})
        if result.deleted_count == 0:
            print(f"API: Item de portfólio {id} não encontrado para exclusão.")
            return jsonify({'message': 'Item de portfólio não encontrado'}), 404
        print(f"API: Item de portfólio {id} excluído com sucesso!")
        return jsonify({'message': 'Item de portfólio excluído com sucesso!'}), 204
    except Exception as e:
        print(f"API: Erro ao excluir item de portfólio {id}: {e}")
        return jsonify({'message': 'Erro ao excluir item de portfólio', 'error': str(e)}), 500

# --- Rotas de Depoimentos ---
@app.route('/testimonials', methods=['GET'])
def get_approved_testimonials():
    print("API: Recebida requisição GET para /testimonials (aprovados)")
    try:
        testimonials = []
        for testimonial in testimonials_collection.find({'approved': True}):
            testimonial['_id'] = str(testimonial['_id'])
            testimonials.append(testimonial)
        print(f"API: Retornando {len(testimonials)} depoimentos aprovados.")
        return jsonify(testimonials), 200
    except Exception as e:
        print(f"API: Erro ao buscar depoimentos aprovados: {e}")
        return jsonify({'message': 'Erro ao buscar depoimentos', 'error': str(e)}), 500

@app.route('/testimonials/all', methods=['GET'])
@token_required
def get_all_testimonials():
    print("API: Recebida requisição GET para /testimonials/all (todos)")
    try:
        testimonials = []
        for testimonial in testimonials_collection.find():
            testimonial['_id'] = str(testimonial['_id'])
            testimonials.append(testimonial)
        print(f"API: Retornando {len(testimonials)} depoimentos (todos).")
        return jsonify(testimonials), 200
    except Exception as e:
        print(f"API: Erro ao buscar todos os depoimentos: {e}")
        return jsonify({'message': 'Erro ao buscar todos os depoimentos', 'error': str(e)}), 500

@app.route('/testimonials', methods=['POST'])
def add_testimonial():
    print("API: Recebida requisição POST para /testimonials")
    data = request.get_json()
    if not data or not all(k in data for k in ['name', 'rating', 'comment']):
        print("API: Dados inválidos para adicionar depoimento.")
        return jsonify({'message': 'Dados inválidos. Campos necessários: name, rating, comment'}), 400
    try:
        data['approved'] = False # Depoimentos novos precisam ser aprovados
        data['createdAt'] = datetime.utcnow()
        result = testimonials_collection.insert_one(data)
        print(f"API: Depoimento enviado para revisão! ID: {result.inserted_id}")
        return jsonify({'message': 'Depoimento enviado com sucesso para revisão!', 'id': str(result.inserted_id)}), 201
    except Exception as e:
        print(f"API: Erro ao adicionar depoimento: {e}")
        return jsonify({'message': 'Erro ao adicionar depoimento', 'error': str(e)}), 500

@app.route('/testimonials/<id>/approve', methods=['PUT'])
@token_required
def approve_testimonial(id):
    print(f"API: Recebida requisição PUT para /testimonials/{id}/approve")
    try:
        result = testimonials_collection.update_one({'_id': ObjectId(id)}, {'$set': {'approved': True}})
        if result.matched_count == 0:
            print(f"API: Depoimento {id} não encontrado para aprovação.")
            return jsonify({'message': 'Depoimento não encontrado'}), 404
        print(f"API: Depoimento {id} aprovado com sucesso!")
        return jsonify({'message': 'Depoimento aprovado com sucesso!'}), 200
    except Exception as e:
        print(f"API: Erro ao aprovar depoimento {id}: {e}")
        return jsonify({'message': 'Erro ao aprovar depoimento', 'error': str(e)}), 500

@app.route('/testimonials/<id>', methods=['DELETE'])
@token_required
def delete_testimonial(id):
    print(f"API: Recebida requisição DELETE para /testimonials/{id}")
    try:
        result = testimonials_collection.delete_one({'_id': ObjectId(id)})
        if result.deleted_count == 0:
            print(f"API: Depoimento {id} não encontrado para exclusão.")
            return jsonify({'message': 'Depoimento não encontrado'}), 404
        print(f"API: Depoimento {id} excluído com sucesso!")
        return jsonify({'message': 'Depoimento excluído com sucesso!'}), 204
    except Exception as e:
        print(f"API: Erro ao excluir depoimento {id}: {e}")
        return jsonify({'message': 'Erro ao excluir depoimento', 'error': str(e)}), 500

# --- Rotas de Links Sociais ---
@app.route('/social-links', methods=['GET'])
def get_social_links():
    print("API: Recebida requisição GET para /social-links")
    try:
        links = social_links_collection.find_one({})
        if links:
            links['_id'] = str(links['_id'])
            print("API: Links sociais encontrados.")
            return jsonify(links), 200
        print("API: Nenhum link social configurado.")
        return jsonify({}), 200 # Retorna um objeto vazio se não houver links configurados
    except Exception as e:
        print(f"API: Erro ao buscar links sociais: {e}")
        return jsonify({'message': 'Erro ao buscar links sociais', 'error': str(e)}), 500

@app.route('/social-links', methods=['PUT'])
@token_required
def update_social_links():
    print("API: Recebida requisição PUT para /social-links")
    data = request.get_json()
    if not data:
        print("API: Nenhum dado fornecido para atualização de links sociais.")
        return jsonify({'message': 'Nenhum dado fornecido para atualização'}), 400
    try:
        # Busca o único documento de links sociais ou cria um se não existir
        existing_links = social_links_collection.find_one({})
        if existing_links:
            result = social_links_collection.update_one({'_id': existing_links['_id']}, {'$set': data})
            print("API: Links sociais atualizados.")
        else:
            result = social_links_collection.insert_one(data)
            print("API: Links sociais inseridos (primeira vez).")
        return jsonify({'message': 'Links sociais atualizados com sucesso!'}), 200
    except Exception as e:
        print(f"API: Erro ao atualizar links sociais: {e}")
        return jsonify({'message': 'Erro ao atualizar links sociais', 'error': str(e)}), 500

# --- Rotas de Músicas Spotify ---
@app.route('/spotify-tracks', methods=['GET'])
def get_spotify_tracks():
    print("API: Recebida requisição GET para /spotify-tracks")
    try:
        tracks = []
        for track in spotify_tracks_collection.find():
            track['_id'] = str(track['_id'])
            tracks.append(track)
        print(f"API: Retornando {len(tracks)} músicas do Spotify.")
        return jsonify(tracks), 200
    except Exception as e:
        print(f"API: Erro ao buscar músicas do Spotify: {e}")
        return jsonify({'message': 'Erro ao buscar músicas do Spotify', 'error': str(e)}), 500

@app.route('/spotify-tracks', methods=['POST'])
@token_required
def add_spotify_track():
    print("API: Recebida requisição POST para /spotify-tracks")
    data = request.get_json()
    if not data or not all(k in data for k in ['title', 'artist', 'spotifyId']):
        print("API: Dados inválidos para adicionar música Spotify.")
        return jsonify({'message': 'Dados inválidos. Campos necessários: title, artist, spotifyId'}), 400
    try:
        result = spotify_tracks_collection.insert_one(data)
        print(f"API: Música Spotify adicionada! ID: {result.inserted_id}")
        return jsonify({'message': 'Música Spotify adicionada com sucesso!', 'id': str(result.inserted_id)}), 201
    except Exception as e:
        print(f"API: Erro ao adicionar música Spotify: {e}")
        return jsonify({'message': 'Erro ao adicionar música Spotify', 'error': str(e)}), 500

@app.route('/spotify-tracks/<id>', methods=['PUT'])
@token_required
def update_spotify_track(id):
    print(f"API: Recebida requisição PUT para /spotify-tracks/{id}")
    data = request.get_json()
    if not data:
        print("API: Nenhum dado fornecido para atualizar música Spotify.")
        return jsonify({'message': 'Nenhum dado fornecido para atualização'}), 400
    try:
        result = spotify_tracks_collection.update_one({'_id': ObjectId(id)}, {'$set': data})
        if result.matched_count == 0:
            print(f"API: Música Spotify {id} não encontrada para atualização.")
            return jsonify({'message': 'Música Spotify não encontrada'}), 404
        print(f"API: Música Spotify {id} atualizada com sucesso!")
        return jsonify({'message': 'Música Spotify atualizada com sucesso!'}), 200
    except Exception as e:
        print(f"API: Erro ao atualizar música Spotify {id}: {e}")
        return jsonify({'message': 'Erro ao atualizar música Spotify', 'error': str(e)}), 500

@app.route('/spotify-tracks/<id>', methods=['DELETE'])
@token_required
def delete_spotify_track(id):
    print(f"API: Recebida requisição DELETE para /spotify-tracks/{id}")
    try:
        result = spotify_tracks_collection.delete_one({'_id': ObjectId(id)})
        if result.deleted_count == 0:
            print(f"API: Música Spotify {id} não encontrada para exclusão.")
            return jsonify({'message': 'Música Spotify não encontrada'}), 404
        print(f"API: Música Spotify {id} excluída com sucesso!")
        return jsonify({'message': 'Música Spotify excluída com sucesso!'}), 204
    except Exception as e:
        print(f"API: Erro ao excluir música Spotify {id}: {e}")
        return jsonify({'message': 'Erro ao excluir música Spotify', 'error': str(e)}), 500

# --- Rotas de Vídeos do YouTube ---
@app.route('/youtube-videos', methods=['GET'])
def get_youtube_videos():
    print("API: Recebida requisição GET para /youtube-videos")
    try:
        videos = []
        for video in youtube_videos_collection.find():
            video['_id'] = str(video['_id']) # Converte ObjectId para string para JSON
            videos.append(video)
        print(f"API: Retornando {len(videos)} vídeos do YouTube.")
        return jsonify(videos), 200
    except Exception as e:
        print(f"API: Erro ao buscar vídeos do YouTube: {e}")
        return jsonify({'message': 'Erro ao buscar vídeos do YouTube', 'error': str(e)}), 500

@app.route('/youtube-videos', methods=['POST'])
@token_required
def add_youtube_video():
    print("API: Recebida requisição POST para /youtube-videos")
    data = request.get_json()
    if not data or not all(k in data for k in ['title', 'type', 'youtubeId']):
        print("API: Dados inválidos para adicionar vídeo/playlist do YouTube.")
        return jsonify({'message': 'Dados inválidos. Campos necessários: title, type, youtubeId'}), 400
    
    try:
        if data['type'] not in ['video', 'playlist']:
            print(f"API: Tipo de vídeo inválido: {data['type']}")
            return jsonify({'message': 'Tipo de vídeo inválido. Use \"video\" ou \"playlist\".'}), 400

        result = youtube_videos_collection.insert_one(data)
        print(f"API: Vídeo/Playlist do YouTube adicionado com sucesso! ID: {result.inserted_id}")
        return jsonify({'message': 'Vídeo/Playlist do YouTube adicionado com sucesso!', 'id': str(result.inserted_id)}), 201
    except Exception as e:
        print(f"API: Erro ao adicionar vídeo/playlist do YouTube: {e}")
        return jsonify({'message': 'Erro ao adicionar vídeo/playlist do YouTube', 'error': str(e)}), 500

@app.route('/youtube-videos/<id>', methods=['PUT'])
@token_required
def update_youtube_video(id):
    print(f"API: Recebida requisição PUT para /youtube-videos/{id}")
    data = request.get_json()
    if not data:
        print("API: Nenhum dado fornecido para atualização de vídeo/playlist do YouTube.")
        return jsonify({'message': 'Nenhum dado fornecido para atualização'}), 400
    
    try:
        if 'type' in data and data['type'] not in ['video', 'playlist']:
            print(f"API: Tipo de vídeo inválido na atualização: {data['type']}")
            return jsonify({'message': 'Tipo de vídeo inválido. Use \"video\" ou \"playlist\".'}), 400

        result = youtube_videos_collection.update_one(
            {'_id': ObjectId(id)},
            {'$set': data}
        )
        if result.matched_count == 0:
            print(f"API: Vídeo/Playlist do YouTube {id} não encontrado para atualização.")
            return jsonify({'message': 'Vídeo/Playlist do YouTube não encontrado'}), 404
        print(f"API: Vídeo/Playlist do YouTube {id} atualizado com sucesso!")
        return jsonify({'message': 'Vídeo/Playlist do YouTube atualizado com sucesso!'}), 200
    except Exception as e:
        print(f"API: Erro ao atualizar vídeo/playlist do YouTube {id}: {e}")
        return jsonify({'message': 'Erro ao atualizar vídeo/playlist do YouTube', 'error': str(e)}), 500

@app.route('/youtube-videos/<id>', methods=['DELETE'])
@token_required
def delete_youtube_video(id):
    print(f"API: Recebida requisição DELETE para /youtube-videos/{id}")
    try:
        result = youtube_videos_collection.delete_one({'_id': ObjectId(id)})
        if result.deleted_count == 0:
            print(f"API: Vídeo/Playlist do YouTube {id} não encontrado para exclusão.")
            return jsonify({'message': 'Vídeo/Playlist do YouTube não encontrado'}), 404
        print(f"API: Vídeo/Playlist do YouTube {id} excluído com sucesso!")
        return jsonify({'message': 'Vídeo/Playlist do YouTube excluído com sucesso!'}), 204
    except Exception as e:
        print(f"API: Erro ao excluir vídeo/playlist do YouTube {id}: {e}")
        return jsonify({'message': 'Erro ao excluir vídeo/playlist do YouTube', 'error': str(e)}), 500

# --- Rotas de Upload/Download de Arquivos (Netlify Functions - Apenas Metadados) ---
@app.route('/files', methods=['GET'])
def get_files():
    print("API: Recebida requisição GET para /files")
    try:
        files = []
        for file_item in files_collection.find():
            file_item['_id'] = str(file_item['_id'])
            files.append(file_item)
        print(f"API: Retornando {len(files)} arquivos.")
        return jsonify(files), 200
    except Exception as e:
        print(f"API: Erro ao buscar arquivos: {e}")
        return jsonify({'message': 'Erro ao buscar arquivos', 'error': str(e)}), 500

@app.route('/files', methods=['POST'])
@token_required
def upload_file():
    print("API: Recebida requisição POST para /files (upload)")
    # Verifica se a requisição tem a parte do arquivo
    if 'file' not in request.files:
        print("API: Nenhuma parte de arquivo na requisição.")
        return jsonify({'message': 'Nenhum arquivo enviado'}), 400
    
    file = request.files['file']
    title = request.form.get('title')
    description = request.form.get('description')
    file_type = request.form.get('file_type') # Ex: acapella, drumkit, sample_pack

    # Se o usuário não selecionar um arquivo, o navegador envia um arquivo vazio sem nome
    if file.filename == '':
        print("API: Nenhum arquivo selecionado.")
        return jsonify({'message': 'Nenhum arquivo selecionado'}), 400
    
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        
        # ATENÇÃO: Esta é a parte que você precisa modificar para integrar com um serviço de armazenamento em nuvem.
        # A Netlify Function receberá o arquivo, mas não pode armazená-lo persistentemente.
        # Aqui você enviaria o 'file.stream' para o S3, Cloudinary, etc.
        # Por enquanto, estamos apenas simulando e gerando uma URL de download "placeholder".
        
        # Exemplo de como você obteria uma URL de download real de um serviço de nuvem:
        # s3_url = upload_to_s3(file.stream, filename)
        # cloudinary_url = upload_to_cloudinary(file.stream, filename)
        
        # Para fins de demonstração, vamos usar uma URL de download de exemplo.
        # Em um ambiente real, esta URL viria do seu serviço de armazenamento em nuvem.
        # Se você quiser que o download funcione, esta URL PRECISA ser um link direto para o arquivo.
        # Por exemplo, se você usar o Cloudinary, seria algo como:
        # download_url = f"https://res.cloudinary.com/SEU_CLOUD_NAME/raw/upload/{filename}"
        
        # Para o propósito desta simulação, vamos usar um placeholder:
        download_url = f"https://example.com/downloads/{filename}" # SUBSTITUA PELA SUA URL REAL DE DOWNLOAD!
        print(f"API: Simulação de upload. Arquivo '{filename}' seria enviado para o armazenamento em nuvem. URL de download: {download_url}")

        # Salva metadados no MongoDB
        file_data = {
            'title': title,
            'description': description,
            'file_type': file_type,
            'filename': filename, # Nome original do arquivo
            'download_url': download_url, # URL real para download do serviço de nuvem
            'upload_date': datetime.utcnow()
        }
        result = files_collection.insert_one(file_data)
        print(f"API: Metadados do arquivo salvos no MongoDB. ID: {result.inserted_id}")
        return jsonify({'message': 'Arquivo enviado com sucesso!', 'id': str(result.inserted_id), 'filename': filename, 'download_url': download_url}), 201
    else:
        print("API: Tipo de arquivo não permitido.")
        return jsonify({'message': 'Tipo de arquivo não permitido'}), 400

@app.route('/files/<id>', methods=['PUT'])
@token_required
def update_file_metadata(id):
    print(f"API: Recebida requisição PUT para /files/{id} (metadados)")
    data = request.get_json()
    if not data:
        print("API: Nenhum dado fornecido para atualização de metadados.")
        return jsonify({'message': 'Nenhum dado fornecido para atualização'}), 400
    
    try:
        # Remove campos que não devem ser atualizados diretamente
        data.pop('filename', None)
        data.pop('upload_date', None)
        # A download_url pode ser atualizada se o arquivo for movido, mas o upload_file é para o upload inicial
        # data.pop('download_url', None)

        result = files_collection.update_one(
            {'_id': ObjectId(id)},
            {'$set': data}
        )
        if result.matched_count == 0:
            print(f"API: Arquivo {id} não encontrado para atualização de metadados.")
            return jsonify({'message': 'Arquivo não encontrado'}), 404
        print(f"API: Metadados do arquivo {id} atualizados com sucesso!")
        return jsonify({'message': 'Metadados do arquivo atualizados com sucesso!'}), 200
    except Exception as e:
        print(f"API: Erro ao atualizar metadados do arquivo {id}: {e}")
        return jsonify({'message': 'Erro ao atualizar metadados do arquivo', 'error': str(e)}), 500


@app.route('/files/<id>', methods=['DELETE'])
@token_required
def delete_file(id):
    print(f"API: Recebida requisição DELETE para /files/{id}")
    try:
        file_item = files_collection.find_one({'_id': ObjectId(id)})
        if not file_item:
            print(f"API: Arquivo {id} não encontrado para exclusão.")
            return jsonify({'message': 'Arquivo não encontrado'}), 404
        
        # ATENÇÃO: Se você estiver usando um serviço de armazenamento em nuvem,
        # aqui você precisaria chamar a API desse serviço para excluir o arquivo físico.
        # Exemplo (pseudocódigo para S3):
        # s3_client.delete_object(Bucket='your-s3-bucket-name', Key=file_item['filename'])
        
        print(f"API: Simulação de exclusão. Arquivo '{file_item['filename']}' seria excluído do armazenamento em nuvem.")

        # Exclui o metadado do MongoDB
        result = files_collection.delete_one({'_id': ObjectId(id)})
        if result.deleted_count == 0:
            return jsonify({'message': 'Arquivo não encontrado no banco de dados'}), 404
        print(f"API: Arquivo {id} excluído com sucesso do banco de dados e (simulado) do armazenamento em nuvem!")
        return jsonify({'message': 'Arquivo excluído com sucesso!'}), 204
    except Exception as e:
        print(f"API: Erro ao excluir arquivo {id}: {e}")
        return jsonify({'message': 'Erro ao excluir arquivo', 'error': str(e)}), 500

# --- NOVAS ROTAS PARA BLOG POSTS ---
@app.route('/blog-posts', methods=['GET'])
def get_approved_blog_posts():
    print("API: Recebida requisição GET para /blog-posts (aprovados)")
    try:
        posts = []
        # Ordena por data de criação decrescente
        for post in blog_posts_collection.find({'approved': True}).sort('createdAt', -1):
            post['_id'] = str(post['_id'])
            # Formata a data para um formato mais legível no frontend
            post['createdAt'] = post['createdAt'].strftime('%d/%m/%Y %H:%M')
            posts.append(post)
        print(f"API: Retornando {len(posts)} posts de blog aprovados.")
        return jsonify(posts), 200
    except Exception as e:
        print(f"API: Erro ao buscar posts de blog aprovados: {e}")
        return jsonify({'message': 'Erro ao buscar posts de blog', 'error': str(e)}), 500

@app.route('/blog-posts/all', methods=['GET'])
@token_required
def get_all_blog_posts():
    print("API: Recebida requisição GET para /blog-posts/all (todos)")
    try:
        posts = []
        # Ordena por data de criação decrescente
        for post in blog_posts_collection.find().sort('createdAt', -1):
            post['_id'] = str(post['_id'])
            post['createdAt'] = post['createdAt'].strftime('%d/%m/%Y %H:%M')
            posts.append(post)
        print(f"API: Retornando {len(posts)} posts de blog (todos).")
        return jsonify(posts), 200
    except Exception as e:
        print(f"API: Erro ao buscar todos os posts de blog: {e}")
        return jsonify({'message': 'Erro ao buscar todos os posts de blog', 'error': str(e)}), 500

@app.route('/blog-posts/<id>', methods=['GET'])
def get_single_blog_post(id):
    print(f"API: Recebida requisição GET para /blog-posts/{id}")
    try:
        post = blog_posts_collection.find_one({'_id': ObjectId(id)})
        if not post:
            print(f"API: Post de blog {id} não encontrado.")
            return jsonify({'message': 'Post de blog não encontrado'}), 404
        
        post['_id'] = str(post['_id'])
        post['createdAt'] = post['createdAt'].strftime('%d/%m/%Y %H:%M')
        print(f"API: Retornando post de blog {id}.")
        return jsonify(post), 200
    except Exception as e:
        print(f"API: Erro ao buscar post de blog {id}: {e}")
        return jsonify({'message': 'Erro ao buscar post de blog', 'error': str(e)}), 500

@app.route('/blog-posts', methods=['POST'])
@token_required
def add_blog_post():
    print("API: Recebida requisição POST para /blog-posts")
    data = request.get_json()
    if not data or not all(k in data for k in ['title', 'content', 'author']):
        print("API: Dados inválidos para adicionar post de blog.")
        return jsonify({'message': 'Dados inválidos. Campos necessários: title, content, author'}), 400
    try:
        data['createdAt'] = datetime.utcnow()
        data['approved'] = data.get('approved', False) # Admin pode definir como aprovado na criação
        result = blog_posts_collection.insert_one(data)
        print(f"API: Post de blog adicionado com sucesso! ID: {result.inserted_id}")
        return jsonify({'message': 'Post de blog adicionado com sucesso!', 'id': str(result.inserted_id)}), 201
    except Exception as e:
        print(f"API: Erro ao adicionar post de blog: {e}")
        return jsonify({'message': 'Erro ao adicionar post de blog', 'error': str(e)}), 500

@app.route('/blog-posts/<id>', methods=['PUT'])
@token_required
def update_blog_post(id):
    print(f"API: Recebida requisição PUT para /blog-posts/{id}")
    data = request.get_json()
    if not data:
        print("API: Nenhum dado fornecido para atualização de post de blog.")
        return jsonify({'message': 'Nenhum dado fornecido para atualização'}), 400
    try:
        # Não permite alterar a data de criação via PUT
        data.pop('createdAt', None) 
        result = blog_posts_collection.update_one({'_id': ObjectId(id)}, {'$set': data})
        if result.matched_count == 0:
            print(f"API: Post de blog {id} não encontrado para atualização.")
            return jsonify({'message': 'Post de blog não encontrado'}), 404
        print(f"API: Post de blog {id} atualizado com sucesso!")
        return jsonify({'message': 'Post de blog atualizado com sucesso!'}), 200
    except Exception as e:
        print(f"API: Erro ao atualizar post de blog {id}: {e}")
        return jsonify({'message': 'Erro ao atualizar post de blog', 'error': str(e)}), 500

@app.route('/blog-posts/<id>', methods=['DELETE'])
@token_required
def delete_blog_post(id):
    print(f"API: Recebida requisição DELETE para /blog-posts/{id}")
    try:
        result = blog_posts_collection.delete_one({'_id': ObjectId(id)})
        if result.deleted_count == 0:
            print(f"API: Post de blog {id} não encontrado para exclusão.")
            return jsonify({'message': 'Post de blog não encontrado'}), 404
        print(f"API: Post de blog {id} excluído com sucesso!")
        return jsonify({'message': 'Post de blog excluído com sucesso!'}), 204
    except Exception as e:
        print(f"API: Erro ao excluir post de blog {id}: {e}")
        return jsonify({'message': 'Erro ao excluir post de blog', 'error': str(e)}), 500


# Handler para Netlify Functions (não altere esta parte)
def handler(event, context):
    print("API: Handler do Netlify invocado.")
    # Adiciona CORS headers para todas as respostas
    def add_cors_headers(response):
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
        return response
    
    app.after_request(add_cors_headers)

    # Handle OPTIONS preflight requests
    if request.method == 'OPTIONS':
        return jsonify({}), 200

    from werkzeug.serving import run_simple
    from werkzeug.wrappers import Request, Response

    # Mock the WSGI environment for Flask
    # Netlify provides event as a dictionary that needs to be translated to WSGI
    environ = {
        'REQUEST_METHOD': event['httpMethod'],
        'PATH_INFO': event['path'].replace('/.netlify/functions/api', ''), # Remove base path
        'QUERY_STRING': event.get('queryStringParameters', ''),
        'SERVER_NAME': 'localhost', # Can be anything for serverless
        'SERVER_PORT': '80', # Can be anything for serverless
        'wsgi.version': (1, 0),
        'wsgi.input': request.stream, # Use request.stream for body
        'wsgi.errors': os.environ.get('wsgi.errors', []), # Placeholder
        'wsgi.multithread': False,
        'wsgi.multiprocess': False,
        'wsgi.run_once': False,
        'wsgi.url_scheme': 'http', # Or 'https'
    }

    # Add headers from event to environ
    for header_name, header_value in event.get('headers', {}).items():
        # WSGI headers are uppercase and prefixed with HTTP_
        if header_name.lower() == 'content-type':
            environ['CONTENT_TYPE'] = header_value
        elif header_name.lower() == 'content-length':
            environ['CONTENT_LENGTH'] = header_value
        else:
            environ[f'HTTP_{header_name.upper().replace("-", "_")}'] = header_value

    # If there's a body, ensure it's handled
    if event.get('body'):
        environ['wsgi.input'] = io.BytesIO(event['body'].encode('utf-8'))
        environ['CONTENT_LENGTH'] = str(len(event['body']))
    else:
        environ['wsgi.input'] = io.BytesIO(b'')
        environ['CONTENT_LENGTH'] = '0'

    # Capture Flask's response
    response_status = None
    response_headers = []
    response_body = []

    def start_response(status, headers):
        nonlocal response_status, response_headers
        response_status = status
        response_headers = headers
        return response_body.append

    response_iter = app(environ, start_response)
    for data in response_iter:
        response_body.append(data)

    # Construct the Netlify Function response
    return {
        "statusCode": int(response_status.split(" ")[0]),
        "headers": dict(response_headers),
        "body": "".join([part.decode('utf-8') if isinstance(part, bytes) else part for part in response_body])
    }

# Para teste local (opcional)
if __name__ == '__main__':
    print("API: Executando localmente (modo debug).")
    os.environ['MONGODB_URI'] = "mongodb+srv://cbr_records_db:eloah24@cluster0.c1z1ima.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
    os.environ['JWT_SECRET'] = "tudocerto"
    os.environ['ADMIN_USERNAME'] = "admin"
    os.environ['ADMIN_PASSWORD'] = "eloah24"
    
    # Para teste local, você precisará instalar 'waitress'
    from waitress import serve
    serve(app, host='127.0.0.1', port=5000)
