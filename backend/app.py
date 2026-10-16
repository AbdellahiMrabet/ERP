from flask import Flask
from flask_cors import CORS
from db import db, app
from auth import auth_bp, seed_auth
from routes import register_routes
from crm import crm_bp
from project_mgmt import pm_bp  
from hr_mgmt import hr_bp  
from gevent.pywsgi import WSGIServer

# app.app_context().push()
# db.create_all()

app.register_blueprint(auth_bp)
app.register_blueprint(crm_bp)
app.register_blueprint(pm_bp)  
app.register_blueprint(hr_bp)
register_routes(app)

# NEW: create missing tables (incl. the CRM ones) and sync roles on every start.
# Safe to run repeatedly. Must run after all models are imported (they are, above).
with app.app_context():
    db.create_all()
    seed_auth()

if __name__ == '__main__':
    # http_server = WSGIServer(('localhost', 4500), app)
    # http_server.serve_forever()
    
    # For Development with auto-reload and local network access:
    app.run(debug=True, host='0.0.0.0', port=4500, reloader_type='stat')