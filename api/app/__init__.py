from flask import Flask, jsonify

from .config import Config
from .extensions import db, migrate, jwt, cors


def create_app(config_class: type = Config) -> Flask:
    app = Flask(__name__)
    app.config.from_object(config_class)

    # Extensions
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    cors.init_app(
        app,
        resources={r"/*": {"origins": [app.config["FRONTEND_ORIGIN"]]}},
        supports_credentials=True,
    )

    # Models must be imported so Alembic/migrate can see them.
    from . import models  # noqa: F401

    # Blueprints
    from .auth.routes import bp as auth_bp
    from .modules.routes import bp as modules_bp
    from .files.routes import bp as files_bp
    from .interviews.routes import bp as interviews_bp
    from .ai.routes import bp as ai_bp

    app.register_blueprint(auth_bp, url_prefix="/auth")
    app.register_blueprint(modules_bp, url_prefix="/modules")
    app.register_blueprint(files_bp, url_prefix="/files")
    app.register_blueprint(interviews_bp, url_prefix="/interviews")
    app.register_blueprint(ai_bp, url_prefix="/ai")

    @app.get("/health")
    def health():
        return jsonify(status="ok")

    return app
