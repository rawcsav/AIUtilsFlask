from gevent import monkey

monkey.patch_socket()
monkey.patch_ssl()


import os
from dotenv import load_dotenv


dotenv_path = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(dotenv_path):
    load_dotenv(dotenv_path)

from app import create_app, socketio, celery
from app.tasks import audio_task, image_task, deletion_task, embedding_task, task_logging

app = create_app()


if __name__ == "__main__":
    FLASK_DEBUG = True
    socketio.run(app, host="localhost", port=8081, allow_unsafe_werkzeug=True, use_reloader=False)
