from flask_sqlalchemy import SQLAlchemy
from flask_marshmallow import Marshmallow
from flask import Flask
from dotenv import load_dotenv
import os
import pymysql
pymysql.install_as_MySQLdb()
from flask_jwt_extended import JWTManager

# Load environment variables from the .env file
load_dotenv()

app = Flask(__name__)

DATABASE_URL = os.getenv('DATABASE_URL')
jwt_secret_key = os.getenv('JWT_SECRET_KEY')
app.config['JWT_SECRET_KEY'] = jwt_secret_key
jwt = JWTManager(app)

app.config['SQLALCHEMY_DATABASE_URI'] = f'{DATABASE_URL}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
ma = Marshmallow(app)