# netlify/functions/youtube-videos.py

import os
import json
from pymongo import MongoClient
from bson.objectid import ObjectId
from flask import Flask, request, jsonify
from functools import wraps
import jwt

# Inicializa o Flask
app = Flask(__name__)

# Configuração do MongoDB
# As variáveis de ambiente serão lidas do Netlify
MONGO_URI = os.environ.get('MONGODB_URI')
if not MONGO_URI:
    # Se estiver testando localmente sem as variáveis de ambiente, defina-as aqui
    # Ex: MONGO_URI = "mongodb+srv://cbr_records_db:eloah24@cluster0.c1z1ima.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
    raise ValueError("MONGODB_URI environment variable not set.")

client = MongoClient(MONGO_URI)
db = client.cbr_records # Nome do seu banco de dados

# Coleção para vídeos do YouTube
youtube_videos_collection = db.youtube_videos

# Chave secreta para JWT (deve ser a mesma usada no seu login admin)
JWT_SECRET = os.environ.get('JWT_SECRET')
if not JWT_SECRET:
    # Se estiver testando localmente sem as variáveis de ambiente, defina-as aqui
    # Ex: JWT_SECRET = "tudocerto"
    raise ValueError("JWT_SECRET environment variable not set.")

# --- Middleware de Autenticação JWT ---
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if 'Authorization' in request.headers:
            token = request.headers['Authorization'].split(" ")[1]

        if not token:
            return jsonify({'message': 'Token é necessário para esta ação!'}), 401
        
        try:
            # Decodifica o token e verifica se é válido
            data = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            # Aqui você pode adicionar mais validações, como verificar o 'username' ou 'role'
            # Por exemplo, se o token foi gerado para 'admin'
            if data.get('username') != 'admin': 
                return jsonify({'message': 'Permissão negada: Apenas administradores podem realizar esta ação.'}), 403
        except jwt.ExpiredSignatureError:
            return jsonify({'message': 'Token expirado. Faça login novamente.'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'message': 'Token inválido. Faça login novamente.'}), 401
        except Exception as e:
            return jsonify({'message': f'Erro de autenticação: {str(e)}'}), 401

        return f(*args, **kwargs)
    return decorated

# --- Rotas da API para Vídeos do YouTube ---

@app.route('/youtube-videos', methods=['GET'])
def get_youtube_videos():
    """
    Retorna todos os vídeos do YouTube armazenados no banco de dados.
    """
    try:
        videos = []
        for video in youtube_videos_collection.find():
            video['_id'] = str(video['_id']) # Converte ObjectId para string para JSON
            videos.append(video)
        return jsonify(videos), 200
    except Exception as e:
        print(f"Erro ao buscar vídeos do YouTube: {e}")
        return jsonify({'message': 'Erro ao buscar vídeos do YouTube', 'error': str(e)}), 500

@app.route('/youtube-videos', methods=['POST'])
@token_required
def add_youtube_video():
    """
    Adiciona um novo vídeo/playlist do YouTube ao banco de dados.
    Requer autenticação JWT.
    """
    data = request.get_json()
    if not data or not all(k in data for k in ['title', 'type', 'youtubeId']):
        return jsonify({'message': 'Dados inválidos. Campos necessários: title, type, youtubeId'}), 400
    
    try:
        # Garante que o tipo é 'video' ou 'playlist'
        if data['type'] not in ['video', 'playlist']:
            return jsonify({'message': 'Tipo de vídeo inválido. Use "video" ou "playlist".'}), 400

        result = youtube_videos_collection.insert_one(data)
        return jsonify({'message': 'Vídeo/Playlist do YouTube adicionado com sucesso!', 'id': str(result.inserted_id)}), 201
    except Exception as e:
        print(f"Erro ao adicionar vídeo/playlist do YouTube: {e}")
        return jsonify({'message': 'Erro ao adicionar vídeo/playlist do YouTube', 'error': str(e)}), 500

@app.route('/youtube-videos/<id>', methods=['PUT'])
@token_required
def update_youtube_video(id):
    """
    Atualiza um vídeo/playlist do YouTube existente pelo seu ID.
    Requer autenticação JWT.
    """
    data = request.get_json()
    if not data:
        return jsonify({'message': 'Nenhum dado fornecido para atualização'}), 400
    
    try:
        # Opcional: Garante que o tipo é 'video' ou 'playlist' se for atualizado
        if 'type' in data and data['type'] not in ['video', 'playlist']:
            return jsonify({'message': 'Tipo de vídeo inválido. Use "video" ou "playlist".'}), 400

        result = youtube_videos_collection.update_one(
            {'_id': ObjectId(id)},
            {'$set': data}
        )
        if result.matched_count == 0:
            return jsonify({'message': 'Vídeo/Playlist do YouTube não encontrado'}), 404
        return jsonify({'message': 'Vídeo/Playlist do YouTube atualizado com sucesso!'}), 200
    except Exception as e:
        print(f"Erro ao atualizar vídeo/playlist do YouTube: {e}")
        return jsonify({'message': 'Erro ao atualizar vídeo/playlist do YouTube', 'error': str(e)}), 500

@app.route('/youtube-videos/<id>', methods=['DELETE'])
@token_required
def delete_youtube_video(id):
    """
    Exclui um vídeo/playlist do YouTube pelo seu ID.
    Requer autenticação JWT.
    """
    try:
        result = youtube_videos_collection.delete_one({'_id': ObjectId(id)})
        if result.deleted_count == 0:
            return jsonify({'message': 'Vídeo/Playlist do YouTube não encontrado'}), 404
        return jsonify({'message': 'Vídeo/Playlist do YouTube excluído com sucesso!'}), 204
    except Exception as e:
        print(f"Erro ao excluir vídeo/playlist do YouTube: {e}")
        return jsonify({'message': 'Erro ao excluir vídeo/playlist do YouTube', 'error': str(e)}), 500

# Handler para Netlify Functions
def handler(event, context):
    from werkzeug.serving import run_simple
    from werkzeug.wrappers import Request, Response

    # Cria um objeto Request a partir do evento Netlify
    request = Request(event)
    
    # Chama o aplicativo Flask
    response = app.wsgi_app(request.environ, lambda status, headers: (status, headers))

    # Converte a resposta Flask para o formato esperado pelo Netlify
    return {
        "statusCode": response[0].split(" ")[0],
        "headers": dict(response[1]),
        "body": response[2][0].decode('utf-8') if response[2] else ""
    }

# Para teste local (opcional)
if __name__ == '__main__':
    # Defina as variáveis de ambiente para teste local
    os.environ['MONGODB_URI'] = "mongodb+srv://cbr_records_db:eloah24@cluster0.c1z1ima.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
    os.environ['JWT_SECRET'] = "tudocerto"
    app.run(debug=True)
