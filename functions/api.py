# functions/api.py

import os
import json
from pymongo import MongoClient
from bson.objectid import ObjectId
from flask import Flask, request, jsonify, send_from_directory
from functools import wraps
import jwt
from datetime import datetime, timedelta
from werkzeug.utils import secure_filename
import io # Importação necessária para o handler do Netlify

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
        return jsonify({'message': 'Nenhuma parte de arquivo na requisição.'}), 400